const express = require("express");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

const scanSchema = z.object({
  cargoItemId: z.string().uuid(),
  length: z.number().positive().max(2000), // Max 20 meters just in case
  width: z.number().positive().max(2000),
  height: z.number().positive().max(2000),
  cbm: z.number().nonnegative().max(100),
  confidence: z.number().min(0).max(1),
  scannerDevice: z.string().min(1),
  photoUrl: z.string().url().optional().nullable(),
});

// Handle scanner incoming results
router.post("/", authenticateToken, async (req, res) => {
  try {
    const validatedData = scanSchema.parse(req.body);
    const { cargoItemId, length, width, height, cbm, confidence, scannerDevice, photoUrl } = validatedData;

    const cargoItem = await prisma.cargoItem.findFirst({
      where: { id: cargoItemId, shipment: { organizationId: req.org.id } },
    });

    if (!cargoItem) return res.status(404).json({ error: "Cargo Item not found" });

    const scan = await prisma.scanResult.create({
      data: {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        cbm: parseFloat(cbm),
        confidence: parseFloat(confidence),
        scannerDevice,
        photoUrl,
        operatorId: req.user.id,
        cargoItemId: cargoItem.id,
      },
    });

    // Update cargo item with latest scan data
    await prisma.cargoItem.update({
      where: { id: cargoItem.id },
      data: {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        cbm: parseFloat(cbm),
        scanConfidence: parseFloat(confidence),
        status: "SCANNED"
      }
    });

    res.status(201).json(scan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation Error", details: err.errors });
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

module.exports = router;
