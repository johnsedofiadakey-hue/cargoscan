const eventBus = require("../lib/events");
const prisma = require("../lib/prisma");

/**
 * Evaluate if a new scan creates a dispute based on CBM gap.
 */
async function evaluate(cargoItemId, newCbm, scanId, orgId) {
  try {
    // Only a PASS-quality prior scan can be treated as the origin baseline.
    const originScans = await prisma.scanResult.findMany({
      where: {
        cargoItemId: cargoItemId,
        id: { not: scanId },
        source: { not: "MANUAL" },
        OR: [
          { qualityStatus: "PASS" },
          { qualityStatus: null, confidence: { gte: 0.9 } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (originScans.length === 0) {
      await prisma.dispute.create({
        data: {
          cargoItemId,
          status: "REVIEW",
          originCbm: 0,
          destinationCbm: Number(newCbm || 0),
          notes: "No origin scan on record — verify manually.",
        }
      });
      return;
    }

    const prev = originScans[0];
    const prevCbm = Number(prev.cbm || 0);
    const nextCbm = Number(newCbm || 0);
    const gap = Math.abs(prevCbm - nextCbm) / Math.max(prevCbm, nextCbm, 1);

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
        originCbm: prevCbm,
        destinationCbm: nextCbm,
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
      originCbm: prevCbm,
      destinationCbm: nextCbm,
      consigneePhone: item?.consignee?.phone,
      consigneeName: item?.consignee?.name,
      trackingCode: cargoItemId,
    });

  } catch (err) {
    console.error("Dispute Evaluation Error:", err);
  }
}

module.exports = { evaluate };
