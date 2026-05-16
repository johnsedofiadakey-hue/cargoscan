require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const { startScheduler } = require("./services/scheduler");
const apiKeyRateLimiter = require("./middleware/rateLimit");
const crypto = require("crypto");

const app = express();
const prisma = new PrismaClient();

// Request ID Middleware
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// Security & Logging Middleware
app.use(helmet());
app.use(morgan("combined"));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// CORS
const allowedOrigins = [
  "http://localhost:5173",
  "https://cargoscan-app-2026.web.app",
  process.env.FRONTEND_URL
].filter(Boolean);

const subdomainRegex = /^https:\/\/[a-z0-9-]+\.cargoscan\.app$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || subdomainRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

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
  console.error("Global Error Handler:", err.stack);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy violation" });
  }
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;

// Start background scheduler
startScheduler();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});
