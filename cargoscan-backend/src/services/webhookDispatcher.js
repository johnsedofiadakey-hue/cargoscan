const eventBus = require("../lib/events");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Dispatches an event to all active webhooks for an organization.
 * @param {string} orgId - Organization ID
 * @param {string} event - Event name (e.g., 'scan.created')
 * @param {object} payload - Event payload
 */
async function dispatch(orgId, event, payload) {
  const webhooks = await prisma.webhook.findMany({
    where: { organizationId: orgId, active: true },
  });

  for (const webhook of webhooks) {
    const canonical = JSON.stringify(payload);
    
    // Sign payload with webhook secret
    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(canonical)
      .digest("hex");

    console.log(`[WebhookDispatcher] Dispatching ${event} to ${webhook.url}`);
    
    // In production, make the HTTP call here.
    // We simulate it here and log the result.
    try {
      // Simulate successful delivery
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          status: "SUCCESS",
          statusCode: 200,
          payload: canonical,
          response: "OK (Simulated)",
        }
      });
      console.log(`[WebhookDispatcher] Successfully delivered to ${webhook.url}`);
    } catch (err) {
      console.error(`[WebhookDispatcher] Failed delivering to ${webhook.url}:`, err);
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          status: "FAILED",
          statusCode: 500,
          payload: canonical,
          response: err.message,
        }
      });
    }
  }
}

// Subscribe to events
eventBus.on("scan.created", async (data) => {
  console.log("[WebhookDispatcher] Reacting to scan.created");
  if (data.orgId) {
    await dispatch(data.orgId, "scan.created", data);
  }
});

module.exports = { dispatch };
