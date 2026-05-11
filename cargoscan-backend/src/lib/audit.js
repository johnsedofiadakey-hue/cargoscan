const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Writes an entry to the AuditLog table.
 * @param {object} params
 * @param {string} [params.userId] - ID of the user who performed the action
 * @param {string} [params.orgId] - ID of the organization
 * @param {string} params.action - Action performed (e.g., 'CREATE', 'UPDATE')
 * @param {string} params.target - Target resource (e.g., 'SHIPMENT', 'SCAN')
 * @param {string} [params.targetId] - ID of the target resource
 * @param {object} [params.details] - Additional details as a JSON object
 */
async function log({ userId, orgId, action, target, targetId, details }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId: orgId,
        action,
        target,
        targetId,
        details: details ? JSON.stringify(details) : null,
      }
    });
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err);
  }
}

module.exports = { log };
