const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const scans = [];
const packages = [];

app.post("/api/packages", (req, res) => {
  const p = req.body?.package;
  if (!p || !p.trackingNumber) return res.status(400).json({ error: "Missing package payload or tracking number" });

  const pkg = {
    id: p.id || `pkg_${Date.now()}`,
    customerName: p.customerName || "",
    trackingNumber: p.trackingNumber,
    itemName: p.itemName || "",
    description: p.description || "",
    supplier: p.supplier || "",
    shipmentId: p.shipmentId || "",
    quantity: Number(p.quantity || 1),
    cbm: p.cbm == null ? null : Number(p.cbm),
    lengthCm: p.lengthCm == null ? null : Number(p.lengthCm),
    widthCm: p.widthCm == null ? null : Number(p.widthCm),
    heightCm: p.heightCm == null ? null : Number(p.heightCm),
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = packages.findIndex(x => x.trackingNumber === pkg.trackingNumber);
  if (existingIndex >= 0) {
    packages[existingIndex] = { ...packages[existingIndex], ...pkg, updatedAt: new Date().toISOString() };
  } else {
    packages.unshift(pkg);
  }

  res.status(201).json({ ok: true, package: pkg });
});

app.get("/api/packages", (req, res) => {
  const tracking = String(req.query.tracking || "").trim();
  if (tracking) {
    const p = packages.find(x => x.trackingNumber === tracking);
    return res.json({ packages: p ? [p] : [] });
  }
  res.json({ packages });
});

app.patch("/api/packages/:trackingNumber", (req, res) => {
  const trackingNumber = req.params.trackingNumber;
  const idx = packages.findIndex(x => x.trackingNumber === trackingNumber);
  if (idx < 0) return res.status(404).json({ error: "Package not found" });

  packages[idx] = { ...packages[idx], ...req.body, trackingNumber, updatedAt: new Date().toISOString() };
  res.json({ ok: true, package: packages[idx] });
});

app.post("/api/scans", (req, res) => {
  const scan = req.body?.scan;
  if (!scan) return res.status(400).json({ error: "Missing scan payload" });
  if (!scan.trackingNumber) return res.status(400).json({ error: "Scan requires trackingNumber" });

  const normalized = {
    id: scan.id || `scan_${Date.now()}`,
    trackingNumber: scan.trackingNumber,
    lengthCm: Number(scan.lengthCm || 0),
    widthCm: Number(scan.widthCm || 0),
    heightCm: Number(scan.heightCm || 0),
    cbm: Number(scan.cbm || 0),
    timestamp: scan.timestamp || new Date().toISOString(),
    operatorId: scan.operatorId || "unknown",
    source: scan.source || "ARKit LiDAR",
    confidenceScore: Number(scan.confidenceScore || 0),
    photoBase64: scan.photoBase64 || null,
  };

  scans.unshift(normalized);

  const packageIndex = packages.findIndex(p => p.trackingNumber === normalized.trackingNumber);
  if (packageIndex >= 0) {
    packages[packageIndex] = {
      ...packages[packageIndex],
      lengthCm: normalized.lengthCm,
      widthCm: normalized.widthCm,
      heightCm: normalized.heightCm,
      cbm: normalized.cbm,
      updatedAt: new Date().toISOString(),
    };
  }

  res.status(201).json({ ok: true, id: normalized.id, linked: packageIndex >= 0 });
});

app.get("/api/scans", (req, res) => {
  const tracking = String(req.query.tracking || "").trim();
  if (tracking) {
    return res.json({ scans: scans.filter(s => s.trackingNumber === tracking) });
  }
  res.json({ scans });
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(3000, () => console.log("API running on http://localhost:3000"));
