const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkWebhookLimit } = require("../middleware/plan");

const prisma = new PrismaClient();

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
  const { name, url, eventFilter } = req.body;

  if (!name || !url || !eventFilter) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const signingSecret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        eventFilter: Array.isArray(eventFilter) ? eventFilter.join(",") : eventFilter,
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
