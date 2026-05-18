const express = require("express");
const { z } = require("zod");
const { authenticateToken } = require("../middleware/auth");
const { authenticateEither } = require("../middleware/either");
const storage = require("../services/storage");
const disputes = require("../services/disputes");
const eventBus = require("../lib/events");
const scanCertificate = require("../lib/scanCertificate");
const audit = require("../lib/audit");
const rateLimiter = require("../middleware/rateLimit");
const { checkScanQuality } = require("../services/scanQuality");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const prisma = require("../lib/prisma");

const scanSchema = z.object({
  cargoItemId: z.string().uuid(),
  length: z.number().positive().max(2000), // Max 20 meters just in case
  width: z.number().positive().max(2000),
  height: z.number().positive().max(2000),
  cbm: z.number().nonnegative().max(100).optional(),
  confidence: z.number().min(0).max(1),
  scannerDevice: z.string().min(1),
  source: z.string().min(1).max(32).optional(),
  photoUrl: z.string().url().optional().nullable(),
  qualityStatus: z.enum(["PASS", "REVIEW", "RESCAN"]).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  qualityReason: z.string().optional(),
  qualityFlags: z.array(z.string()).optional(),
});

const qualitySchema = z.object({
  imageBase64: z.string().optional(),
  imageUrl: z.string().url().optional(),
  dimensions: z.object({
    length: z.number().positive().max(2000),
    width: z.number().positive().max(2000),
    height: z.number().positive().max(2000),
    cbm: z.number().nonnegative().max(100),
    confidence: z.number().min(0).max(1),
  }),
  metrics: z.object({
    distanceMetres: z.number().optional(),
    pitchDegrees: z.number().optional(),
    stableFrameCount: z.number().optional(),
    lidarPointCount: z.number().optional(),
    edgeAgreement: z.number().optional(),
    edgeFusion: z.boolean().optional(),
    deviceModel: z.string().optional(),
  }).optional().default({}),
}).refine(data => data.imageBase64 || data.imageUrl, {
  message: "imageBase64 or imageUrl is required",
});

const statusForScanQuality = ({ qualityStatus, confidence }) => {
  if (qualityStatus === "RESCAN") return "RESCAN_REQUIRED";
  if (qualityStatus === "REVIEW") return "NEEDS_REVIEW";
  if (qualityStatus === "PASS") return "READY_TO_LOAD";
  if (confidence >= 0.9) return "READY_TO_LOAD";
  if (confidence >= 0.75) return "NEEDS_REVIEW";
  return "RESCAN_REQUIRED";
};

// Serve local uploads before dynamic scan routes so /uploads/:key is public in dev.
router.get("/uploads/:key", (req, res) => {
  const filePath = path.join(__dirname, "../../uploads", path.basename(req.params.key));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  res.sendFile(filePath);
});

router.post("/quality-check", authenticateToken, async (req, res) => {
  try {
    const payload = qualitySchema.parse(req.body);
    const result = await checkScanQuality(payload);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation Error", details: err.issues });
    }
    console.error("[ScanQuality] Request failed:", err);
    res.status(500).json({ error: "Failed to check scan quality" });
  }
});

// Handle scanner incoming results
router.post("/", authenticateEither, rateLimiter, async (req, res) => {
  try {
    const validatedData = scanSchema.parse(req.body);
    const {
      cargoItemId,
      length,
      width,
      height,
      cbm: providedCbm,
      confidence,
      scannerDevice,
      source,
      photoUrl,
      qualityStatus,
      qualityScore,
      qualityReason,
      qualityFlags,
    } = validatedData;

    const cargoItem = await prisma.cargoItem.findFirst({
      where: { id: cargoItemId, shipment: { organizationId: req.org.id } },
      include: { consignee: true },
    });

    if (!cargoItem) return res.status(404).json({ error: "Cargo Item not found" });

    const calculatedCbm = (length * width * height) / 1000000;
    const cbm = providedCbm ?? calculatedCbm;
    const nextStatus = statusForScanQuality({ qualityStatus, confidence });
    const scanSource = source || (req.apiKey ? "API" : "LIDAR");
    const scan = await prisma.scanResult.create({
      data: {
        length,
        width,
        height,
        cbm,
        confidence,
        scannerDevice,
        photoUrl,
        operatorId: req.user ? req.user.id : null,
        apiKeyId: req.apiKey ? req.apiKey.id : null,
        source: scanSource,
        qualityStatus,
        qualityScore,
        qualityReason,
        qualityFlags: qualityFlags ? JSON.stringify(qualityFlags) : undefined,
        cargoItemId: cargoItem.id,
      },
    });

    // Update cargo item with latest scan data
    await prisma.cargoItem.update({
      where: { id: cargoItem.id },
      data: {
        length,
        width,
        height,
        cbm,
        scanConfidence: confidence,
        status: nextStatus,
      }
    });

    // Evaluate disputes
    await disputes.evaluate(cargoItem.id, cbm, scan.id, req.org.id);

    // Create Scan Certificate
    const certificate = await scanCertificate.issue({
      cargoItemId,
      payload: { length, width, height, cbm, confidence, scannerDevice, qualityStatus, nextStatus },
    });

    // Write Audit Log
    await audit.log({
      userId: req.user ? req.user.id : null,
      orgId: req.org.id,
      action: "CREATE",
      target: "SCAN",
      targetId: scan.id,
      details: { cargoItemId, cbm, status: nextStatus, qualityStatus },
    });

    // Emit Event
    eventBus.emit("scan.created", {
      orgId: req.org.id,
      cargoItemId,
      scanId: scan.id,
      certificateUrl: `/api/tracking/_verify/${certificate.hash}`,
      consigneePhone: cargoItem.consignee?.phone,
      consigneeName: cargoItem.consignee?.name,
      trackingCode: cargoItem.trackingCode,
      dimensions: `${length}x${width}x${height} cm`,
      cbm,
      status: nextStatus,
    });

    res.status(201).json({ ...scan, itemStatus: nextStatus, certificate });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation Error", details: err.issues });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to save scan result" });
  }
});

router.get("/:cargoItemId", authenticateToken, async (req, res) => {
  try {
    const scans = await prisma.scanResult.findMany({
      where: { 
        cargoItemId: req.params.cargoItemId,
        cargoItem: { shipment: { organizationId: req.org.id } }
      },
      include: { operator: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(scans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Request presigned upload URL
router.post("/:cargoItemId/photo", authenticateToken, async (req, res) => {
  const { cargoItemId } = req.params;
  const { mimeType } = req.body;

  try {
    const cargoItem = await prisma.cargoItem.findFirst({
      where: { id: cargoItemId, shipment: { organizationId: req.org.id } },
    });

    if (!cargoItem) return res.status(404).json({ error: "Cargo Item not found" });

    const key = `cargo_${cargoItemId}_${Date.now()}.${mimeType.split("/")[1] || "jpg"}`;
    const data = await storage.presignUpload({ key, mimeType });

    res.json({
      uploadUrl: data.uploadUrl,
      key,
      publicUrl: data.publicUrl,
      expiresAt: data.expiresAt,
    });
  } catch (err) {
    console.error("Photo Request Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update scan with photo URL
router.patch("/:scanResultId", authenticateToken, async (req, res) => {
  const { scanResultId } = req.params;
  const { photoUrl } = req.body;

  try {
    const scan = await prisma.scanResult.findUnique({
      where: { id: scanResultId },
      include: { cargoItem: { include: { shipment: true } } }
    });

    if (!scan || scan.cargoItem.shipment.organizationId !== req.org.id) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const updatedScan = await prisma.scanResult.update({
      where: { id: scanResultId },
      data: { photoUrl },
    });

    res.json(updatedScan);
  } catch (err) {
    console.error("Update Scan Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Local upload fallback — real disk write
router.put("/upload-local", express.raw({ type: "*/*" }), async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "Missing key query param" });

  const uploadsDir = path.join(__dirname, "../../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const safeName = path.basename(key); // prevent path traversal
  const filePath = path.join(uploadsDir, safeName);
  fs.writeFileSync(filePath, req.body);
  res.json({ message: "File uploaded successfully", key: safeName });
});

module.exports = router;
