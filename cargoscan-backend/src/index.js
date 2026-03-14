require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/items", require("./routes/items"));
app.use("/api/shipments", require("./routes/shipments"));
app.use("/api/scans", require("./routes/scans"));
app.use("/api/disputes", require("./routes/disputes"));
app.use("/api/admin", require("./routes/admin"));

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
