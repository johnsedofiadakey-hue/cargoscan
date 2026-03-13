const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// Get all cargo items for the organization
router.get("/", authenticateToken, async (req, res) => {
  try {
    const items = await prisma.cargoItem.findMany({
      where: { shipment: { organizationId: req.org.id } },
      include: { scanResults: true, shipment: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new cargo item (manual entry or placeholder before scan)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { shipmentId, length, width, height, isDamaged } = req.body;
    
    // Formula for CBM
    const cbm = (length * width * height) / 1000000;

    const item = await prisma.cargoItem.create({
      data: {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        cbm,
        scanConfidence: 100.0, // Manual entry assume 100%
        isDamaged: isDamaged || false,
        shipmentId,
      },
      include: { shipment: true },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create item" });
  }
});

// Get a specific item by ID
router.get("/:id", authenticateToken, async (req, res) => {
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

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { length, width, height, status, isDamaged } = req.body;

    const existing = await prisma.cargoItem.findFirst({
      where: { id: req.params.id, shipment: { organizationId: req.org.id } },
    });
    if (!existing) return res.status(404).json({ error: "Item not found" });

    let dataToUpdate = { status, isDamaged };
    if (length && width && height) {
      dataToUpdate.length = parseFloat(length);
      dataToUpdate.width = parseFloat(width);
      dataToUpdate.height = parseFloat(height);
      dataToUpdate.cbm = (dataToUpdate.length * dataToUpdate.width * dataToUpdate.height) / 1000000;
    }

    const item = await prisma.cargoItem.update({
      where: { id: req.params.id },
      data: dataToUpdate,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
