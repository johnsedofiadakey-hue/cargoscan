const eventBus = require("../lib/events");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Retry delays in ms: immediate, 1s, 2s, 4s, 8s, 16s (1 initial + 5 retries)
const RETRY_DELAYS = [0, 1000, 2000, 4000, 8000, 16000];

async function deliverOnce(webhook, event, rawBody, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const responseBody = await resp.text().catch(() => "");
    return {
      ok: resp.ok,
      responseStatus: resp.status,
      responseBody: responseBody.substring(0, 2000),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      responseStatus: null,
      responseBody: err.name === "AbortError" ? "Request timed out (10s)" : err.message,
    };
  }
}

async function dispatchToWebhook(webhook, event, payload) {
  const rawBody = JSON.stringify(payload);
  const deliveryId = crypto.randomUUID();

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }

    const t = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac("sha256", webhook.signingSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");

    const headers = {
      "Content-Type": "application/json",
      "X-CargoScan-Event": event,
      "X-CargoScan-Delivery": deliveryId,
      "X-CargoScan-Signature": `t=${t},v1=${sig}`,
    };

    const result = await deliverOnce(webhook, event, rawBody, headers);

    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        status: result.ok ? "SUCCESS" : "FAILED",
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        attemptCount: attempt + 1,
      },
    }).catch(err => console.error("[WebhookDispatcher] Failed to log delivery:", err.message));

    if (result.ok) {
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { failureCounter: 0 },
      }).catch(() => {});
      console.log(`[WebhookDispatcher] Delivered ${event} to ${webhook.url} (attempt ${attempt + 1})`);
      return;
    }

    console.warn(`[WebhookDispatcher] Attempt ${attempt + 1} failed for ${webhook.url}: ${result.responseBody?.substring(0, 100)}`);
  }

  // All attempts exhausted
  await prisma.webhook.update({
    where: { id: webhook.id },
    data: { failureCounter: { increment: 1 } },
  }).catch(() => {});
  console.error(`[WebhookDispatcher] All retries exhausted for ${webhook.url} (event: ${event})`);
}

async function dispatch(orgId, event, payload) {
  let webhooks;
  try {
    webhooks = await prisma.webhook.findMany({
      where: { organizationId: orgId, active: true },
    });
  } catch (err) {
    console.error("[WebhookDispatcher] Failed to load webhooks:", err.message);
    return;
  }

  for (const webhook of webhooks) {
    const subscribedEvents = webhook.eventFilter.split(",").map(e => e.trim());
    if (!subscribedEvents.includes(event) && !subscribedEvents.includes("*")) continue;

    // Fire and forget — don't block the request
    dispatchToWebhook(webhook, event, payload).catch(err =>
      console.error(`[WebhookDispatcher] Unhandled error for ${webhook.url}:`, err.message)
    );
  }
}

// Event listeners — subscribe to all known events
const ALL_EVENTS = [
  "scan.created",
  "item.created",
  "item.updated",
  "shipment.status_changed",
  "shipment.sealed",
  "shipment.in_transit",
  "shipment.arrived",
  "shipment.delivered",
  "dispute.opened",
  "dispute.resolved",
];

for (const evt of ALL_EVENTS) {
  eventBus.on(evt, async (data) => {
    if (!data.orgId) return;
    await dispatch(data.orgId, evt, data).catch(err =>
      console.error(`[WebhookDispatcher] Error handling ${evt}:`, err.message)
    );
  });
}

console.log("[WebhookDispatcher] Service loaded — event listeners registered");

module.exports = { dispatch };
