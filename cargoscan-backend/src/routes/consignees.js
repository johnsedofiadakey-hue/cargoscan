const express = require("express");
const router = express.Router();
const { authenticateEither } = require("../middleware/either");

const prisma = require("../lib/prisma");

// List consignees
router.get("/", authenticateEither, async (req, res) => {
  const { shipmentId } = req.query;
  try {
    const where = { organizationId: req.org.id };
    if (shipmentId) {
      where.shipmentId = shipmentId;
    }
    const consignees = await prisma.consignee.findMany({ where });
    res.json(consignees);
  } catch (err) {
    console.error("List Consignees Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create consignee
router.post("/", authenticateEither, async (req, res) => {
  const { name, phone, email, whatsappOptIn, cbmRateOverride, notes, shipmentId } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (shipmentId) {
      const shipment = await prisma.shipment.findFirst({
        where: { id: shipmentId, organizationId: req.org.id },
      });
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    }

    const consignee = await prisma.consignee.create({
      data: {
        name,
        phone,
        email,
        whatsappOptIn: whatsappOptIn || false,
        cbmRateOverride,
        notes,
        organizationId: req.org.id,
        shipmentId,
      }
    });

    res.status(201).json(consignee);
  } catch (err) {
    console.error("Create Consignee Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update consignee
router.put("/:id", authenticateEither, async (req, res) => {
  const { name, phone, email, whatsappOptIn, cbmRateOverride, notes } = req.body;

  try {
    const consignee = await prisma.consignee.findUnique({
      where: { id: req.params.id },
    });

    if (!consignee || consignee.organizationId !== req.org.id) {
      return res.status(404).json({ error: "Consignee not found" });
    }

    const updatedConsignee = await prisma.consignee.update({
      where: { id: req.params.id },
      data: {
        name,
        phone,
        email,
        whatsappOptIn,
        cbmRateOverride,
        notes,
      }
    });

    res.json(updatedConsignee);
  } catch (err) {
    console.error("Update Consignee Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete consignee
router.delete("/:id", authenticateEither, async (req, res) => {
  try {
    const consignee = await prisma.consignee.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { cargoItems: true } } }
    });

    if (!consignee || consignee.organizationId !== req.org.id) {
      return res.status(404).json({ error: "Consignee not found" });
    }

    if (consignee._count.cargoItems > 0) {
      return res.status(400).json({ error: "Cannot delete consignee with attached cargo items" });
    }

    await prisma.consignee.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Consignee deleted successfully" });
  } catch (err) {
    console.error("Delete Consignee Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
