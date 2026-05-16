const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateEither } = require("../middleware/either");
const { requireScope } = require("../middleware/apiKey");
const { checkPlanExpiration, checkItemsLimit } = require("../middleware/plan");
const eventBus = require("../lib/events");
const audit = require("../lib/audit");

const router = express.Router();
const prisma = new PrismaClient();

// List cargo items for the organization
router.get("/", authenticateEither, async (req, res) => {
  try {
    const shipmentId = req.query.shipmentId;
    const items = await prisma.cargoItem.findMany({
      where: {
        ...(shipmentId ? { shipmentId } : {}),
        shipment: { organizationId: req.org.id },
      },
      include: { scanResults: true, shipment: true },
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

      if (!shipmentId || length == null || width == null || height == null) {
        return res.status(400).json({ error: "Missing required fields" });
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

      const cbm = (parseFloat(length) * parseFloat(width) * parseFloat(height)) / 1000000;

      const item = await prisma.cargoItem.create({
        data: {
          length: parseFloat(length),
          width: parseFloat(width),
          height: parseFloat(height),
          cbm,
          scanConfidence: 100.0,
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
        details: { shipmentId, cbm },
      });

      eventBus.emit("item.created", {
        orgId: req.org.id,
        itemId: item.id,
        shipmentId,
        cbm,
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

      let dataToUpdate = { status, isDamaged, description };
      if (consigneeId !== undefined) dataToUpdate.consigneeId = consigneeId;
      if (length != null && width != null && height != null) {
        dataToUpdate.length = parseFloat(length);
        dataToUpdate.width = parseFloat(width);
        dataToUpdate.height = parseFloat(height);
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
