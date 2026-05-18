const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkWebhookLimit } = require("../middleware/plan");

const prisma = require("../lib/prisma");
const ALLOWED_EVENTS = new Set([
  "*",
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
]);

function normalizeEvents(events) {
  const list = Array.isArray(events) ? events : String(events || "").split(",");
  return [...new Set(list.map((event) => event.trim()).filter(Boolean))];
}

function isPrivateWebhookHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "[::1]" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validateWebhookUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol)) return "Webhook URL must use http or https";
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return "Production webhook URLs must use https";
    if (isPrivateWebhookHost(parsed.hostname)) return "Webhook URL cannot target localhost or private network hosts";
    return null;
  } catch (err) {
    return "Webhook URL is invalid";
  }
}

// List webhooks
router.get("/", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId: req.org.id },
    });
    res.json(webhooks);
  } catch (err) {
    console.error("List Webhooks Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create webhook
router.post("/", authenticateToken, requireRole(["ADMIN"]), checkWebhookLimit, async (req, res) => {
  // Accept both `events` (new) and `eventFilter` (legacy)
  const { name, url } = req.body;
  const rawEvents = req.body.events || req.body.eventFilter;

  if (!name || !url || !rawEvents) {
    return res.status(400).json({ error: "Missing required fields: name, url, events" });
  }
  const urlError = validateWebhookUrl(url);
  if (urlError) return res.status(400).json({ error: urlError });

  const events = normalizeEvents(rawEvents);
  const invalidEvents = events.filter((event) => !ALLOWED_EVENTS.has(event));
  if (!events.length || invalidEvents.length) {
    return res.status(400).json({ error: "Invalid webhook events", invalidEvents, allowedEvents: [...ALLOWED_EVENTS] });
  }
  const eventFilter = events.join(",");

  try {
    const signingSecret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        eventFilter,
        signingSecret,
        organizationId: req.org.id,
      }
    });

    res.status(201).json(webhook);
  } catch (err) {
    console.error("Create Webhook Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete webhook
router.delete("/:id", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook || webhook.organizationId !== req.org.id) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    await prisma.webhook.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Webhook deleted successfully" });
  } catch (err) {
    console.error("Delete Webhook Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// List deliveries
router.get("/:id/deliveries", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook || webhook.organizationId !== req.org.id) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(deliveries);
  } catch (err) {
    console.error("List Deliveries Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
