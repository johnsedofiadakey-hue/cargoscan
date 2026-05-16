const { PrismaClient } = require("@prisma/client");
const eventBus = require("../lib/events");
const prisma = new PrismaClient();

/**
 * Evaluate if a new scan creates a dispute based on CBM gap.
 */
async function evaluate(cargoItemId, newCbm, scanId, orgId) {
  try {
    // Read previous scans (source != "MANUAL" only)
    const prevScans = await prisma.scanResult.findMany({
      where: {
        cargoItemId: cargoItemId,
        id: { not: scanId },
        source: { not: "MANUAL" },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (prevScans.length === 0) {
      return; // No prior scan to compare
    }

    const prev = prevScans[0];
    const gap = Math.abs(prev.cbm - newCbm) / Math.max(prev.cbm, newCbm);

    let status = "OPEN";
    let notes = `CBM gap detected: ${(gap * 100).toFixed(2)}%`;

    if (gap < 0.05) {
      status = "RESOLVED";
      notes = "Auto-approved (<5% gap)";
    } else if (gap < 0.10) {
      status = "REVIEW"; // Note: Schema says OPEN, RESOLVED, REJECTED. I'll use REVIEW if supported or map to OPEN with notes.
      // The status file says "create Dispute with status REVIEW". 
      // If the schema enum doesn't have REVIEW, it might fail if enforced.
      // Let's check the schema again. Line 181: `status String @default("OPEN")`. It's a String, not an Enum! So it supports any string.
    }

    // Create dispute
    const dispute = await prisma.dispute.create({
      data: {
        cargoItemId,
        status,
        originCbm: prev.cbm,
        destinationCbm: newCbm,
        notes,
      }
    });

    const item = await prisma.cargoItem.findUnique({
      where: { id: cargoItemId },
      include: { consignee: true },
    });

    const eventName = status === "RESOLVED" ? "dispute.resolved" : "dispute.opened";
    eventBus.emit(eventName, {
      orgId,
      disputeId: dispute.id,
      cargoItemId,
      status,
      originCbm: prev.cbm,
      destinationCbm: newCbm,
      consigneePhone: item?.consignee?.phone,
      consigneeName: item?.consignee?.name,
      trackingCode: cargoItemId,
    });

  } catch (err) {
    console.error("Dispute Evaluation Error:", err);
  }
}

module.exports = { evaluate };
