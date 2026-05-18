const express = require("express");
const { authenticateEither } = require("../middleware/either");
const { requireScope } = require("../middleware/apiKey");
const { checkPlanExpiration, checkItemsLimit } = require("../middleware/plan");
const eventBus = require("../lib/events");
const audit = require("../lib/audit");
const { cargoItemTrackingCode } = require("../lib/trackingCodes");

const router = express.Router();
const prisma = require("../lib/prisma");

const PACKAGE_STATUSES = new Set([
  "WAITING_FOR_SCAN",
  "SCANNING",
  "READY_TO_LOAD",
  "NEEDS_REVIEW",
  "RESCAN_REQUIRED",
  "LOADED",
  "DELIVERED",
]);

const parseOptionalPositive = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
};

// List cargo items for the organization
router.get("/", authenticateEither, async (req, res) => {
  try {
    const shipmentId = req.query.shipmentId;
    const items = await prisma.cargoItem.findMany({
      where: {
        ...(shipmentId ? { shipmentId } : {}),
        shipment: { organizationId: req.org.id },
      },
      include: { scanResults: true, shipment: true, consignee: true, container: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new cargo item
router.post(
  "/",
  authenticateEither,
  requireScope("items:write"),
  checkPlanExpiration,
  checkItemsLimit,
  async (req, res) => {
    try {
      const { shipmentId, consigneeId, length, width, height, isDamaged, description } = req.body;

      if (!shipmentId) {
        return res.status(400).json({ error: "Shipment is required" });
      }

      // Verify shipment belongs to the org
      const shipment = await prisma.shipment.findFirst({
        where: { id: shipmentId, organizationId: req.org.id },
      });
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });

      // Verify consignee belongs to the same shipment/org if provided
      if (consigneeId) {
        const consignee = await prisma.consignee.findFirst({
          where: { id: consigneeId, organizationId: req.org.id },
        });
        if (!consignee) return res.status(404).json({ error: "Consignee not found" });
      }

      const parsedLength = parseOptionalPositive(length);
      const parsedWidth = parseOptionalPositive(width);
      const parsedHeight = parseOptionalPositive(height);
      const hasAnyDimension = [parsedLength, parsedWidth, parsedHeight].some((v) => v !== null);
      const hasAllDimensions = [parsedLength, parsedWidth, parsedHeight].every((v) => v !== null && !Number.isNaN(v));

      if (hasAnyDimension && !hasAllDimensions) {
        return res.status(400).json({ error: "Length, width, and height must all be positive numbers when provided" });
      }

      const cbm = hasAllDimensions ? (parsedLength * parsedWidth * parsedHeight) / 1000000 : null;

      const item = await prisma.cargoItem.create({
        data: {
          trackingCode: await cargoItemTrackingCode(prisma),
          length: parsedLength,
          width: parsedWidth,
          height: parsedHeight,
          cbm,
          scanConfidence: null,
          status: hasAllDimensions ? "NEEDS_REVIEW" : "WAITING_FOR_SCAN",
          isDamaged: isDamaged || false,
          description,
          shipmentId,
          consigneeId: consigneeId || null,
        },
        include: { shipment: true },
      });

      await audit.log({
        userId: req.user?.id || null,
        orgId: req.org.id,
        action: "CREATE",
        target: "ITEM",
        targetId: item.id,
        details: { shipmentId, cbm, status: item.status },
      });

      eventBus.emit("item.created", {
        orgId: req.org.id,
        itemId: item.id,
        shipmentId,
        cbm,
        status: item.status,
      });

      res.status(201).json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create item" });
    }
  }
);

// Get a specific item by ID
router.get("/:id", authenticateEither, async (req, res) => {
  try {
    const item = await prisma.cargoItem.findFirst({
      where: {
        id: req.params.id,
        shipment: { organizationId: req.org.id },
      },
      include: { scanResults: true, disputes: true, shipment: true },
    });

    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a cargo item
router.put(
  "/:id",
  authenticateEither,
  requireScope("items:write"),
  checkPlanExpiration,
  async (req, res) => {
    try {
      const { length, width, height, status, isDamaged, consigneeId, description } = req.body;

      const existing = await prisma.cargoItem.findFirst({
        where: { id: req.params.id, shipment: { organizationId: req.org.id } },
      });
      if (!existing) return res.status(404).json({ error: "Item not found" });

      // Validate consigneeId if provided
      if (consigneeId) {
        const consignee = await prisma.consignee.findFirst({
          where: { id: consigneeId, organizationId: req.org.id },
        });
        if (!consignee) return res.status(404).json({ error: "Consignee not found" });
      }

      if (status !== undefined && !PACKAGE_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid package status" });
      }

      let dataToUpdate = { status, isDamaged, description };
      if (consigneeId !== undefined) dataToUpdate.consigneeId = consigneeId;
      if (length !== undefined || width !== undefined || height !== undefined) {
        const parsedLength = parseOptionalPositive(length);
        const parsedWidth = parseOptionalPositive(width);
        const parsedHeight = parseOptionalPositive(height);
        if ([parsedLength, parsedWidth, parsedHeight].some((v) => v === null || Number.isNaN(v))) {
          return res.status(400).json({ error: "Length, width, and height must all be positive numbers when updating dimensions" });
        }
        dataToUpdate.length = parsedLength;
        dataToUpdate.width = parsedWidth;
        dataToUpdate.height = parsedHeight;
        dataToUpdate.cbm = (dataToUpdate.length * dataToUpdate.width * dataToUpdate.height) / 1000000;
      }

      // Remove undefined keys
      Object.keys(dataToUpdate).forEach(k => dataToUpdate[k] === undefined && delete dataToUpdate[k]);

      const item = await prisma.cargoItem.update({
        where: { id: req.params.id },
        data: dataToUpdate,
      });

      await audit.log({
        userId: req.user?.id || null,
        orgId: req.org.id,
        action: "UPDATE",
        target: "ITEM",
        targetId: item.id,
        details: dataToUpdate,
      });

      eventBus.emit("item.updated", {
        orgId: req.org.id,
        itemId: item.id,
        changes: dataToUpdate,
      });

      res.json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

module.exports = router;
