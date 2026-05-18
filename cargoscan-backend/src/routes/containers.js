const express = require("express");
const { authenticateEither } = require("../middleware/either");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { requireScope } = require("../middleware/apiKey");
const { checkPlanExpiration, checkContainerLimit, requireFeature } = require("../middleware/plan");
const audit = require("../lib/audit");

const router = express.Router();
const prisma = require("../lib/prisma");

const capacityByType = {
  "20FT": 33,
  "40FT": 67,
  "40HQ": 76,
};

const LOADABLE_ITEM_STATUS = "READY_TO_LOAD";
const OPEN_CONTAINER_STATUSES = new Set(["OPEN", "LOADING"]);

const containerDto = (container) => {
  const items = container.cargoItems || [];
  const totalCbm = items.reduce((sum, item) => sum + Number(item.cbm || 0), 0);
  const customerCount = new Set(items.map((item) => item.consigneeId).filter(Boolean)).size;

  return {
    ...container,
    totalCbm,
    itemsCount: items.length,
    customerCount,
    utilization: container.capacityCbm ? Math.round((totalCbm / container.capacityCbm) * 1000) / 10 : 0,
  };
};

router.get("/", authenticateEither, async (req, res) => {
  try {
    const containers = await prisma.container.findMany({
      where: { organizationId: req.org.id },
      include: {
        shipment: true,
        cargoItems: { include: { consignee: true, scanResults: { orderBy: { createdAt: "desc" }, take: 1 } } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(containers.map(containerDto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/",
  authenticateToken,
  requireRole(["ADMIN", "SUPERVISOR"]),
  checkPlanExpiration,
  checkContainerLimit,
  async (req, res) => {
    try {
      const { number, type = "40HQ", capacityCbm, destination, vessel, bookingNumber, sealNumber, departureDate, shipmentId } = req.body;
      if (!number) return res.status(400).json({ error: "Container number is required" });

      if (shipmentId) {
        const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, organizationId: req.org.id } });
        if (!shipment) return res.status(404).json({ error: "Shipment not found" });
      }

      const container = await prisma.container.create({
        data: {
          number,
          type,
          capacityCbm: capacityCbm ? parseFloat(capacityCbm) : capacityByType[type] || 76,
          destination,
          vessel,
          bookingNumber,
          sealNumber,
          departureDate: departureDate ? new Date(departureDate) : null,
          shipmentId: shipmentId || null,
          organizationId: req.org.id,
        },
        include: { shipment: true, cargoItems: true },
      });

      await audit.log({
        userId: req.user?.id,
        orgId: req.org.id,
        action: "CREATE",
        target: "CONTAINER",
        targetId: container.id,
        details: { number, type },
      });

      res.status(201).json(containerDto(container));
    } catch (err) {
      if (err.code === "P2002") return res.status(400).json({ error: "Container number already exists" });
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.put("/:id", authenticateToken, requireRole(["ADMIN", "SUPERVISOR"]), checkPlanExpiration, async (req, res) => {
  try {
    const existing = await prisma.container.findFirst({ where: { id: req.params.id, organizationId: req.org.id } });
    if (!existing) return res.status(404).json({ error: "Container not found" });

    const { status, destination, vessel, bookingNumber, sealNumber, departureDate, shipmentId } = req.body;
    if (shipmentId) {
      const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, organizationId: req.org.id } });
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    }

    const data = {
      status,
      destination,
      vessel,
      bookingNumber,
      sealNumber,
      shipmentId,
      departureDate: departureDate ? new Date(departureDate) : undefined,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const container = await prisma.container.update({
      where: { id: existing.id },
      data,
      include: { shipment: true, cargoItems: { include: { consignee: true } } },
    });

    await audit.log({
      userId: req.user?.id,
      orgId: req.org.id,
      action: "UPDATE",
      target: "CONTAINER",
      targetId: container.id,
      details: data,
    });

    res.json(containerDto(container));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/items", authenticateEither, requireScope("items:write"), checkPlanExpiration, async (req, res) => {
  try {
    const { cargoItemId } = req.body;
    const container = await prisma.container.findFirst({ where: { id: req.params.id, organizationId: req.org.id } });
    if (!container) return res.status(404).json({ error: "Container not found" });

    if (!OPEN_CONTAINER_STATUSES.has(container.status)) {
      return res.status(409).json({ error: "Cannot load packages into a sealed, in-transit, arrived, or delivered container" });
    }

    const item = await prisma.cargoItem.findFirst({
      where: { id: cargoItemId, shipment: { organizationId: req.org.id } },
    });
    if (!item) return res.status(404).json({ error: "Cargo item not found" });
    if (item.status !== LOADABLE_ITEM_STATUS) {
      return res.status(409).json({
        error: `Package must be ${LOADABLE_ITEM_STATUS} before loading`,
        status: item.status,
      });
    }
    if (item.cbm == null) {
      return res.status(409).json({ error: "Package has no measured CBM" });
    }
    if (container.shipmentId && item.shipmentId !== container.shipmentId) {
      return res.status(409).json({ error: "Package shipment does not match this container shipment" });
    }

    const loaded = await prisma.cargoItem.findMany({
      where: { containerId: container.id },
      select: { cbm: true },
    });
    const loadedCbm = loaded.reduce((sum, loadedItem) => sum + Number(loadedItem.cbm || 0), 0);
    const nextCbm = loadedCbm + Number(item.cbm || 0);
    if (nextCbm > container.capacityCbm) {
      return res.status(409).json({
        error: "Container capacity would be exceeded",
        capacityCbm: container.capacityCbm,
        loadedCbm,
        packageCbm: item.cbm,
      });
    }

    const updated = await prisma.cargoItem.update({
      where: { id: item.id },
      data: { containerId: container.id, status: "LOADED" },
      include: { shipment: true, consignee: true, container: true, scanResults: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    await audit.log({
      userId: req.user?.id || null,
      orgId: req.org.id,
      apiKeyId: req.apiKey?.id || null,
      action: "ASSIGN",
      target: "ITEM_CONTAINER",
      targetId: item.id,
      details: { containerId: container.id, previousStatus: item.status, newStatus: "LOADED" },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id/items/:itemId", authenticateEither, requireScope("items:write"), checkPlanExpiration, async (req, res) => {
  try {
    const container = await prisma.container.findFirst({ where: { id: req.params.id, organizationId: req.org.id } });
    if (!container) return res.status(404).json({ error: "Container not found" });

    const item = await prisma.cargoItem.findFirst({
      where: { id: req.params.itemId, containerId: container.id, shipment: { organizationId: req.org.id } },
    });
    if (!item) return res.status(404).json({ error: "Cargo item not found in container" });

    const updated = await prisma.cargoItem.update({
      where: { id: item.id },
      data: { containerId: null, status: "READY_TO_LOAD" },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/tracking", authenticateToken, requireFeature("containerTracking"), async (req, res) => {
  try {
    const container = await prisma.container.findFirst({ where: { id: req.params.id, organizationId: req.org.id } });
    if (!container) return res.status(404).json({ error: "Container not found" });

    res.json({
      provider: process.env.CONTAINER_TRACKING_PROVIDER || "manual",
      status: container.status,
      number: container.number,
      lastKnownLocation: null,
      eta: null,
      message: "Live carrier tracking provider is not configured yet. This endpoint is Enterprise-gated and ready for provider integration.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
