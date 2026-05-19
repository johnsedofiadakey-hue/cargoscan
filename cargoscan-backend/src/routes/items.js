const express = require("express");
const { authenticateEither } = require("../middleware/either");
const { requireScope } = require("../middleware/apiKey");
const { checkPlanExpiration, checkItemsLimit } = require("../middleware/plan");
const eventBus = require("../lib/events");
const audit = require("../lib/audit");
const { cargoItemTrackingCode } = require("../lib/trackingCodes");
const { getPagination, sendList, updatedAfterFilter } = require("../lib/pagination");

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
    const pagination = getPagination(req.query);
    const where = {
      ...(shipmentId ? { shipmentId } : {}),
      ...updatedAfterFilter(req.query.updatedAfter),
      shipment: { organizationId: req.org.id },
    };
    const [items, total] = await Promise.all([
      prisma.cargoItem.findMany({
        where,
        include: { scanResults: true, shipment: true, consignee: true, container: true, assignedOperator: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : {}),
      }),
      prisma.cargoItem.count({ where }),
    ]);
    res.setHeader("X-Total-Count", total);
    sendList(res, items, total, pagination);
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
      const { shipmentId, consigneeId, assignedOperatorId, length, width, height, isDamaged, damagePhotoUrl, description } = req.body;

      if (!shipmentId) {
        return res.status(400).json({ error: "Shipment is required" });
      }

      // Verify shipment belongs to the org
      const shipment = await prisma.shipment.findFirst({
        where: { id: shipmentId, organizationId: req.org.id },
      });
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });

      const MUTABLE_SHIPMENT_STATUSES = new Set(["OPEN", "LOADING"]);
      if (!MUTABLE_SHIPMENT_STATUSES.has(shipment.status)) {
        return res.status(409).json({
          error: "Shipment is sealed and cannot accept new items.",
          code: "shipment_locked",
          shipmentStatus: shipment.status,
        });
      }

      // Verify consignee belongs to the same shipment/org if provided
      if (consigneeId) {
        const consignee = await prisma.consignee.findFirst({
          where: { id: consigneeId, organizationId: req.org.id },
        });
        if (!consignee) return res.status(404).json({ error: "Consignee not found" });
      }
      if (assignedOperatorId) {
        const operator = await prisma.user.findFirst({
          where: { id: assignedOperatorId, organizationId: req.org.id, active: true },
        });
        if (!operator) return res.status(404).json({ error: "Assigned operator not found" });
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
          damagePhotoUrl: damagePhotoUrl || null,
          description,
          shipmentId,
          consigneeId: consigneeId || null,
          assignedOperatorId: assignedOperatorId || null,
        },
        include: { shipment: true, assignedOperator: { select: { id: true, name: true, role: true } } },
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
      const { length, width, height, status, isDamaged, damagePhotoUrl, consigneeId, assignedOperatorId, description } = req.body;

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
      if (assignedOperatorId) {
        const operator = await prisma.user.findFirst({
          where: { id: assignedOperatorId, organizationId: req.org.id, active: true },
        });
        if (!operator) return res.status(404).json({ error: "Assigned operator not found" });
      }

      if (status !== undefined && !PACKAGE_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid package status" });
      }

      let dataToUpdate = { status, isDamaged, damagePhotoUrl, description };
      if (consigneeId !== undefined) dataToUpdate.consigneeId = consigneeId;
      if (assignedOperatorId !== undefined) dataToUpdate.assignedOperatorId = assignedOperatorId || null;
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
