const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const disputes = await prisma.dispute.findMany({
      where: { cargoItem: { shipment: { organizationId: req.org.id } } },
      include: { 
        cargoItem: true,
        resolver: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(disputes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { cargoItemId, originCbm, destinationCbm, notes } = req.body;

    const cargoItem = await prisma.cargoItem.findFirst({
      where: { id: cargoItemId, shipment: { organizationId: req.org.id } },
    });

    if (!cargoItem) return res.status(404).json({ error: "Cargo Item not found" });

    const dispute = await prisma.dispute.create({
      data: {
        cargoItemId,
        originCbm: parseFloat(originCbm),
        destinationCbm: parseFloat(destinationCbm),
        notes,
        status: "OPEN"
      },
    });

    res.status(201).json(dispute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create dispute" });
  }
});

module.exports = router;
