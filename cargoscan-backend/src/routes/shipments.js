const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkPlanExpiration, checkShipmentLimit } = require("../middleware/plan");
const eventBus = require("../lib/events");
const audit = require("../lib/audit");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { organizationId: req.org.id },
      include: { cargoItems: true, warehouse: true },
      orderBy: { createdAt: "desc" },
    });

    const result = shipments.map(s => {
      const totalCbm = s.cargoItems.reduce((acc, item) => acc + item.cbm, 0);
      return { ...s, totalCbm, itemsCount: s.cargoItems.length };
    });
    res.json(result);
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
  checkShipmentLimit,
  async (req, res) => {
    try {
      const { code, from, to, cbmCapacity, warehouseId } = req.body;

      const warehouse = await prisma.warehouse.findFirst({
        where: { id: warehouseId, organizationId: req.org.id },
      });
      if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });

      const shipment = await prisma.shipment.create({
        data: {
          code,
          from,
          to,
          cbmCapacity: parseFloat(cbmCapacity),
          organizationId: req.org.id,
          warehouseId: warehouse.id,
          status: "OPEN",
        },
      });

      await audit.log({
        userId: req.user?.id,
        orgId: req.org.id,
        action: "CREATE",
        target: "SHIPMENT",
        targetId: shipment.id,
        details: { code, from, to },
      });

      res.status(201).json(shipment);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(400).json({ error: "Shipment code already exists" });
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Status-to-event map
const STATUS_EVENTS = {
  SEALED: "shipment.sealed",
  IN_TRANSIT: "shipment.in_transit",
  ARRIVED: "shipment.arrived",
  DELIVERED: "shipment.delivered",
};

router.put("/:id", authenticateToken, requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const { status } = req.body;

    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: {
        consignees: { where: { whatsappOptIn: true } },
      },
    });
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const updated = await prisma.shipment.update({
      where: { id: req.params.id },
      data: { status },
    });

    await audit.log({
      userId: req.user?.id,
      orgId: req.org.id,
      action: "UPDATE",
      target: "SHIPMENT",
      targetId: shipment.id,
      details: { previousStatus: shipment.status, newStatus: status },
    });

    const consigneePhones = shipment.consignees.map(c => c.phone);
    const eventPayload = {
      orgId: req.org.id,
      shipmentId: shipment.id,
      shipmentCode: shipment.code,
      previousStatus: shipment.status,
      newStatus: status,
      from: shipment.from,
      to: shipment.to,
      consigneePhones,
    };

    // Always emit the generic event
    eventBus.emit("shipment.status_changed", eventPayload);

    // Emit the specific status event if it exists
    const specificEvent = STATUS_EVENTS[status];
    if (specificEvent) {
      eventBus.emit(specificEvent, eventPayload);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
