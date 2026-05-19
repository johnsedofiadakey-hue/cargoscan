const express = require("express");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkPlanExpiration, checkShipmentLimit } = require("../middleware/plan");
const eventBus = require("../lib/events");
const audit = require("../lib/audit");
const { shipmentTrackingCode } = require("../lib/trackingCodes");
const { getPagination, sendList, updatedAfterFilter } = require("../lib/pagination");

const router = express.Router();
const prisma = require("../lib/prisma");

router.get("/", authenticateToken, async (req, res) => {
  try {
    const pagination = getPagination(req.query);
    const where = { organizationId: req.org.id, ...updatedAfterFilter(req.query.updatedAfter) };
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          cargoItems: { include: { consignee: true, container: true, scanResults: { orderBy: { createdAt: "desc" }, take: 1 } } },
          containers: true,
          warehouse: true,
          events: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : {}),
      }),
      prisma.shipment.count({ where }),
    ]);

    const result = shipments.map(s => {
      const totalCbm = s.cargoItems.reduce((acc, item) => acc + Number(item.cbm || 0), 0);
      return { ...s, totalCbm, itemsCount: s.cargoItems.length };
    });
    res.setHeader("X-Total-Count", total);
    sendList(res, result, total, pagination);
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
        where: warehouseId
          ? { id: warehouseId, organizationId: req.org.id }
          : { organizationId: req.org.id },
        orderBy: { createdAt: "asc" },
      });
      if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });

      const shipment = await prisma.shipment.create({
        data: {
          code,
          trackingCode: await shipmentTrackingCode(prisma),
          from,
          to,
          cbmCapacity: parseFloat(cbmCapacity),
          organizationId: req.org.id,
          warehouseId: warehouse.id,
          status: "OPEN",
        },
      });
      await prisma.shipmentEvent.create({
        data: { shipmentId: shipment.id, status: "OPEN", note: "Shipment created" },
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
    const { status, code, from, to, cbmCapacity } = req.body;

    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: {
        consignees: { where: { whatsappOptIn: true } },
      },
    });
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const data = {};
    if (status !== undefined) data.status = status;
    if (["OPEN", "LOADING"].includes(shipment.status)) {
      if (code !== undefined) data.code = code;
      if (from !== undefined) data.from = from;
      if (to !== undefined) data.to = to;
      if (cbmCapacity !== undefined) data.cbmCapacity = parseFloat(cbmCapacity);
    }

    const updated = await prisma.shipment.update({
      where: { id: req.params.id },
      data,
    });
    if (status && status !== shipment.status) {
      await prisma.shipmentEvent.create({
        data: { shipmentId: shipment.id, status, note: `Status changed from ${shipment.status} to ${status}` },
      });
    }

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

    if (status && status !== shipment.status) {
      eventBus.emit("shipment.status_changed", eventPayload);

      const specificEvent = STATUS_EVENTS[status];
      if (specificEvent) {
        eventBus.emit(specificEvent, eventPayload);
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/export", authenticateToken, async (req, res) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { cargoItems: { include: { consignee: true, container: true } } },
    });
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const rows = [
      ["Tracking Code", "Description", "Consignee", "Status", "CBM", "Container", "Damaged"],
      ...shipment.cargoItems.map((item) => [
        item.trackingCode,
        item.description || "",
        item.consignee?.name || "",
        item.status,
        item.cbm || "",
        item.container?.number || "",
        item.isDamaged ? "Yes" : "No",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${shipment.code}-packing-list.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/notify-customers", authenticateToken, requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { consignees: { where: { whatsappOptIn: true } } },
    });
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    if (!["IN_TRANSIT", "ARRIVED"].includes(shipment.status)) {
      return res.status(409).json({ error: "Customer broadcast is available when shipment is in transit or arrived" });
    }

    const payload = {
      orgId: req.org.id,
      shipmentId: shipment.id,
      shipmentCode: shipment.code,
      from: shipment.from,
      to: shipment.to,
      consigneePhones: shipment.consignees.map((c) => c.phone),
    };
    eventBus.emit(shipment.status === "ARRIVED" ? "shipment.arrived" : "shipment.in_transit", payload);
    res.json({ message: `Notification queued for ${payload.consigneePhones.length} customers`, count: payload.consigneePhones.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
