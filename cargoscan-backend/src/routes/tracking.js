const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Public tracking by item ID or shipment code
router.get("/:code", async (req, res) => {
  const { code } = req.params;

  try {
    // Try to find a shipment first
    const shipment = await prisma.shipment.findUnique({
      where: { code: code },
      include: {
        cargoItems: {
          include: {
            scanResults: true,
          }
        }
      }
    });

    if (shipment) {
      return res.json({ type: "shipment", data: shipment });
    }

    // If not found, try to find a cargo item by ID
    // (Assuming the "code" passed might be a CargoItem ID)
    try {
      const item = await prisma.cargoItem.findUnique({
        where: { id: code },
        include: {
          shipment: true,
          scanResults: true,
          scanCertificates: true,
        }
      });

      if (item) {
        return res.json({ type: "item", data: item });
      }
    } catch (e) {
      // Ignore UUID parsing errors if code is not a valid UUID
    }

    res.status(404).json({ error: "Tracking code not found" });
  } catch (err) {
    console.error("Tracking Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Verify certificate hash
router.get("/_verify/:hash", async (req, res) => {
  const { hash } = req.params;

  try {
    const cert = await prisma.scanCertificate.findUnique({
      where: { hash: hash },
      include: {
        cargoItem: {
          include: {
            shipment: true
          }
        }
      },
    });

    if (!cert) {
      return res.status(404).json({ verified: false, error: "Certificate not found" });
    }

    res.json({
      verified: true,
      certificate: cert,
    });
  } catch (err) {
    console.error("Verify Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
