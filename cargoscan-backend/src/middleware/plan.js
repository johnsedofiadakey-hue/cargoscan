const { LIMITS } = require("../lib/planLimits");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Middleware to check if the organization's plan has expired.
 */
const checkPlanExpiration = async (req, res, next) => {
  const org = req.org;
  if (!org) return res.status(401).json({ error: "Organization context missing" });

  const plan = org.plan || "TRIAL";
  const expiresAt = org.planExpiresAt;

  if (expiresAt && new Date(expiresAt) < new Date() && plan === "TRIAL") {
    return res.status(402).json({ error: "Trial expired. Upgrade to continue.", code: "trial_expired" });
  }

  next();
};

/**
 * Middleware to check shipment limits.
 */
const checkShipmentLimit = async (req, res, next) => {
  const org = req.org;
  const limits = LIMITS[org.plan || "TRIAL"];

  if (limits.shipmentsPerMonth === Infinity) {
    return next();
  }

  // Count shipments created this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const count = await prisma.shipment.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= limits.shipmentsPerMonth) {
      return res.status(429).json({
        error: "Shipment limit reached for your plan",
        code: "plan_limit",
        limit: limits.shipmentsPerMonth,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error("Plan Limit Check Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Middleware to check items limits.
 */
const checkItemsLimit = async (req, res, next) => {
  const org = req.org;
  const limits = LIMITS[org.plan || "TRIAL"];

  if (limits.itemsPerMonth === Infinity) {
    return next();
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const count = await prisma.cargoItem.count({
      where: {
        shipment: { organizationId: org.id },
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= limits.itemsPerMonth) {
      return res.status(429).json({
        error: "Items limit reached for your plan",
        code: "plan_limit",
        limit: limits.itemsPerMonth,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error("Plan Limit Check Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Middleware to check users limits.
 */
const checkUsersLimit = async (req, res, next) => {
  const org = req.org;
  const limits = LIMITS[org.plan || "TRIAL"];

  if (limits.users === Infinity) {
    return next();
  }

  try {
    const count = await prisma.user.count({
      where: { organizationId: org.id },
    });

    if (count >= limits.users) {
      return res.status(429).json({
        error: "User limit reached for your plan",
        code: "plan_limit",
        limit: limits.users,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error("Plan Limit Check Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Middleware to check API keys limits.
 */
const checkApiKeyLimit = async (req, res, next) => {
  const org = req.org;
  const limits = LIMITS[org.plan || "TRIAL"];

  if (limits.apiKeys === Infinity) {
    return next();
  }

  try {
    const count = await prisma.apiKey.count({
      where: { organizationId: org.id },
    });

    if (count >= limits.apiKeys) {
      return res.status(429).json({
        error: "API key limit reached for your plan",
        code: "plan_limit",
        limit: limits.apiKeys,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error("Plan Limit Check Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Middleware to check webhook limits.
 */
const checkWebhookLimit = async (req, res, next) => {
  const org = req.org;
  const limits = LIMITS[org.plan || "TRIAL"];

  if (limits.webhooks === Infinity) {
    return next();
  }

  try {
    const count = await prisma.webhook.count({
      where: { organizationId: org.id },
    });

    if (count >= limits.webhooks) {
      return res.status(429).json({
        error: "Webhook limit reached for your plan",
        code: "plan_limit",
        limit: limits.webhooks,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error("Plan Limit Check Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  checkPlanExpiration,
  checkShipmentLimit,
  checkItemsLimit,
  checkUsersLimit,
  checkApiKeyLimit,
  checkWebhookLimit,
};
