const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { organizationId: req.org.id },
      include: { 
        cargoItems: true,
        warehouse: true
      },
      orderBy: { createdAt: "desc" },
    });
    
    // Add computed totals
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

router.post("/", authenticateToken, requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const { code, from, to, cbmCapacity, warehouseId } = req.body;
    
    const warehouse = await prisma.warehouse.findFirst({
        where: { id: warehouseId, organizationId: req.org.id }
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
        status: "OPEN"
      },
    });
    res.status(201).json(shipment);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: "Shipment code already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", authenticateToken, requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const { status } = req.body;
    
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });

    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const updated = await prisma.shipment.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
