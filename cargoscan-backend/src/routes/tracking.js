const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const prisma = require("../lib/prisma");

// Tighter limit for public, unauthenticated tracking lookups
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tracking requests — please slow down." },
});

router.use(trackingLimiter);

function itemDto(item) {
  const latestScan = item.scanResults?.[0] || null;
  return {
    id: item.trackingCode,
    trackingCode: item.trackingCode,
    description: item.description,
    status: item.status,
    isDamaged: item.isDamaged,
    length: item.length,
    width: item.width,
    height: item.height,
    cbm: item.cbm,
    photoUrl: latestScan?.photoUrl || null,
    scannedAt: latestScan?.createdAt || item.updatedAt || item.createdAt,
  };
}

function shipmentDto(shipment) {
  const cargoItems = shipment.cargoItems || [];
  const events = shipment.events?.length
    ? shipment.events
    : [{ status: "OPEN", note: "Shipment created", createdAt: shipment.createdAt }];
  return {
    id: shipment.trackingCode,
    code: shipment.code,
    trackingCode: shipment.trackingCode,
    from: shipment.from,
    to: shipment.to,
    status: shipment.status,
    cbmCapacity: shipment.cbmCapacity,
    cbm: cargoItems.reduce((sum, item) => sum + Number(item.cbm || 0), 0),
    items: cargoItems.length,
    damagedItems: cargoItems.filter((item) => item.isDamaged).length,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    timeline: events.map((event) => ({
      status: event.status,
      note: event.note,
      timestamp: event.createdAt,
    })),
    cargoItems: cargoItems.map(itemDto),
    organization: shipment.organization
      ? { name: shipment.organization.name, slug: shipment.organization.slug }
      : undefined,
  };
}

function certificateDto(cert) {
  const item = cert.cargoItem;
  return {
    id: cert.id,
    hash: cert.hash,
    issuedAt: cert.createdAt,
    cargoItem: item
      ? {
          id: item.trackingCode,
          trackingCode: item.trackingCode,
          description: item.description,
          cbm: item.cbm,
          status: item.status,
          shipment: item.shipment
            ? {
                code: item.shipment.code,
                trackingCode: item.shipment.trackingCode,
                from: item.shipment.from,
                to: item.shipment.to,
                status: item.shipment.status,
              }
            : null,
        }
      : null,
  };
}

// Public tracking by non-guessable shipment/package tracking code.
router.get("/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { trackingCode: code },
      include: {
        organization: { select: { name: true, slug: true } },
        cargoItems: {
          include: {
            scanResults: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          }
        },
        events: { orderBy: { createdAt: "asc" } },
      }
    });

    if (shipment) {
      return res.json({ type: "shipment", data: shipmentDto(shipment) });
    }

    const item = await prisma.cargoItem.findUnique({
      where: { trackingCode: code },
      include: {
        shipment: true,
        scanResults: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      }
    });

    if (item) {
      return res.json({ type: "item", data: itemDto(item) });
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
      certificate: certificateDto(cert),
    });
  } catch (err) {
    console.error("Verify Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
