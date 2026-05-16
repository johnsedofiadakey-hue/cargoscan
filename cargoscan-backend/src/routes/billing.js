const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireRole } = require("../middleware/auth");
const paystack = require("../services/paystack");
const audit = require("../lib/audit");

const prisma = new PrismaClient();

// Initialize payment
router.post("/init", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  const { plan } = req.body; // e.g., "STARTER", "BUSINESS"

  // Map plan to amount (in cents/pesewas)
  const amounts = {
    STARTER: 2900, // $29.00 or GHS 29.00 depending on currency
    BUSINESS: 7900,
    ENTERPRISE: 19900,
  };

  const amount = amounts[plan];
  if (!amount) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  try {
    const reference = `cs_${req.org.id}_${Date.now()}`;
    
    // Paystack supports metadata
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: req.user.email,
        amount,
        reference,
        currency: "USD", // Explicit currency
        callback_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/billing/callback`,
        metadata: {
          orgId: req.org.id,
          plan: plan,
        }
      }),
    });

    const data = await response.json();
    if (!data.status) {
      return res.status(400).json({ error: data.message });
    }

    res.json({ ...data.data, reference }); // { authorization_url, reference }
  } catch (err) {
    console.error("Init Billing Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Webhook (Paystack) handler
const webhookHandler = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  
  if (!signature) {
    return res.status(400).json({ error: "Missing signature" });
  }

  // req.body is a Buffer because of express.raw
  const rawBody = req.body.toString("utf8");

  if (!paystack.verifyWebhook(rawBody, signature)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    const event = JSON.parse(rawBody);

    if (event.event === "charge.success") {
      const metadata = event.data.metadata;
      const orgId = metadata ? metadata.orgId : null;
      const plan = metadata ? metadata.plan : "BUSINESS"; // fallback
      const providerRef = event.data.reference || event.data.id?.toString();

      if (orgId && providerRef) {
        const existing = await prisma.subscription.findFirst({
          where: { provider: "PAYSTACK", providerRef },
        });
        if (existing) return res.sendStatus(200);

        // Update Organization
        await prisma.organization.update({
          where: { id: orgId },
          data: {
            plan: plan,
            planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
          }
        });
        
        // Write Subscription row
        await prisma.subscription.create({
          data: {
            organizationId: orgId,
            planCode: plan,
            status: "ACTIVE",
            provider: "PAYSTACK",
            providerRef,
          }
        });

        await audit.log({
          orgId,
          action: "BILLING_UPGRADE",
          target: "SUBSCRIPTION",
          targetId: providerRef,
          details: { plan, event: event.event },
        });
        
        console.log(`Org ${orgId} upgraded to ${plan}`);
      }
    } else if (event.event === "charge.failed" || event.event === "invoice.payment_failed" || event.event === "subscription.disable") {
      const metadata = event.data.metadata;
      const orgId = metadata ? metadata.orgId : null;
      
      if (orgId) {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          include: { users: { where: { role: "ADMIN" } } }
        });
        
        if (org && org.users.length > 0) {
          const admin = org.users[0];
          const { sendPaymentFailed } = require("../services/email");
          await sendPaymentFailed(admin.email, admin.name, `${process.env.FRONTEND_URL || "http://localhost:3000"}/billing`);
        }

        await prisma.subscription.create({
          data: {
            organizationId: orgId,
            planCode: org.plan,
            status: event.event === "subscription.disable" ? "DISABLED" : "PAYMENT_FAILED",
            provider: "PAYSTACK",
            providerRef: event.data.reference || event.data.subscription_code || event.data.id?.toString() || `paystack_${Date.now()}`,
          }
        }).catch(() => {});
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Processing Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Override plan (Super Admin only)
router.post("/override", authenticateToken, requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const { orgId, plan, days } = req.body;

  if (!orgId || !plan) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: {
        plan,
        planExpiresAt: expiresAt,
      }
    });

    await audit.log({
      orgId,
      action: "PLAN_OVERRIDE",
      target: "ORGANIZATION",
      targetId: orgId,
      details: { plan, days },
    });

    res.json({ message: `Plan overridden to ${plan}`, org });
  } catch (err) {
    console.error("Override Plan Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = { router, webhookHandler };
