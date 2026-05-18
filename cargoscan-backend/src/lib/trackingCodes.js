const crypto = require("crypto");

function makeTrackingCode(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

async function uniqueTrackingCode(prisma, modelName, prefix) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const trackingCode = makeTrackingCode(prefix);
    const existing = await prisma[modelName].findUnique({ where: { trackingCode } });
    if (!existing) return trackingCode;
  }
  throw new Error(`Could not generate unique ${prefix} tracking code`);
}

const shipmentTrackingCode = (prisma) => uniqueTrackingCode(prisma, "shipment", "SHP");
const cargoItemTrackingCode = (prisma) => uniqueTrackingCode(prisma, "cargoItem", "PKG");

module.exports = { shipmentTrackingCode, cargoItemTrackingCode };
