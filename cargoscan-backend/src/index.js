require("dotenv").config();

// ── Startup environment validation ──────────────────────────────────────────
// Required: app will degrade or fail without these
const REQUIRED_VARS = [
  "JWT_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "SUPER_ADMIN_EMAIL",
  "SUPER_ADMIN_PASSWORD_HASH",
  "FRONTEND_URL",
  "API_PUBLIC_URL",
];
// Recommended: features silently disabled when absent
const RECOMMENDED_VARS = [
  ["SENDGRID_API_KEY",            "email delivery (invites, password reset)"],
  ["FIREBASE_SERVICE_ACCOUNT_JSON","Google OAuth sign-in"],
  ["PAYSTACK_SECRET_KEY",         "billing / plan upgrades"],
  ["SENTRY_DSN",                  "error tracking"],
  ["WHATSAPP_TOKEN",              "WhatsApp notifications"],
  ["SUPABASE_URL",                "scan photo storage"],
];

const missingRequired = REQUIRED_VARS.filter(k => !process.env[k]);
if (missingRequired.length) {
  // Log loudly but don't crash — Render injects vars asynchronously on first boot
  console.error(
    `[STARTUP] ⚠️  Missing REQUIRED env vars: ${missingRequired.join(", ")}` +
    "\n         Set these in Render → cargoscan-api → Environment before serving real traffic."
  );
}
const missingRecommended = RECOMMENDED_VARS.filter(([k]) => !process.env[k]);
if (missingRecommended.length) {
  missingRecommended.forEach(([k, feature]) =>
    console.warn(`[STARTUP]    Missing ${k} — ${feature} will be disabled`)
  );
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const rateLimit = require("express-rate-limit");
const Sentry = require("@sentry/node");
const { startScheduler } = require("./services/scheduler");
const apiKeyRateLimiter = require("./middleware/rateLimit");
const crypto = require("crypto");
const logger = require("./lib/logger");

const app = express();
const prisma = require("./lib/prisma");

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || "development" });
}

// Request ID Middleware
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// Security & Logging Middleware
app.use(helmet());
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customProps: (req) => ({
    requestId: req.id,
    orgId: req.org?.id,
    userId: req.user?.id,
  }),
}));

// CORS
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5176",
  "http://127.0.0.1:5176",
  "https://cargoscan-app-2026.web.app",
  process.env.FRONTEND_URL
].flatMap((origin) => String(origin || "").split(","))
  .map((origin) => origin.trim())
  .filter(Boolean);

const subdomainRegex = /^https:\/\/[a-z0-9-]+\.cargoscan\.app$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || subdomainRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-API-Key", "X-Request-Id"],
  optionsSuccessStatus: 204,
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

const { router: billingRouter, webhookHandler } = require("./routes/billing");

// Mount webhook BEFORE express.json() to get raw body for signature verification
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), webhookHandler);

app.use(express.json());

// Per-API-key rate limiter — applies globally to all authenticated routes
app.use(apiKeyRateLimiter);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/items", require("./routes/items"));
app.use("/api/shipments", require("./routes/shipments"));
app.use("/api/containers", require("./routes/containers"));
app.use("/api/scans", require("./routes/scans"));
app.use("/api/disputes", require("./routes/disputes"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/keys", require("./routes/apiKeys"));
app.use("/api/webhooks", require("./routes/webhooks"));
app.use("/api/consignees", require("./routes/consignees"));
app.use("/api/audit-logs", require("./routes/audit"));
app.use("/api/tracking", require("./routes/tracking"));
app.use("/api/billing", billingRouter);
app.use("/api/users", require("./routes/users"));

// Load event-driven services — must be required AFTER routes so the event bus exists
require("./services/whatsapp");
require("./services/webhookDispatcher");

// Healthcheck
app.get("/api/health", async (req, res) => {
  const checks = {
    database: { status: "unknown" },
    redis: { status: "unknown" },
  };

  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    checks.database.status = "ok";
  } catch (e) {
    checks.database.status = "down";
    checks.database.error = e.message;
  }

  try {
    // Check Redis
    const redis = require("./services/redis");
    const pong = await redis.ping ? await redis.ping() : await redis.set("_hc", "1").then(() => "PONG");
    if (pong === "PONG" || pong === "OK" || pong) {
      checks.redis.status = "ok";
    } else {
      checks.redis.status = "down";
    }
  } catch (e) {
    checks.redis.status = "down";
    checks.redis.error = e.message;
  }

  const isOk = checks.database.status === "ok" && checks.redis.status === "ok";
  
  res.status(isOk ? 200 : 503).json({
    status: isOk ? "ok" : "error",
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Centralized Error Handling
app.use((err, req, res, next) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  req.log?.error({ err, requestId: req.id, orgId: req.org?.id, userId: req.user?.id }, "global error handler");
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy violation" });
  }
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;

// Start background scheduler
startScheduler();

app.listen(PORT, () => {
  logger.info({ port: PORT }, "server started");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});
