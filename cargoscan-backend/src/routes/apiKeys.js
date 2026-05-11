const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkApiKeyLimit } = require("../middleware/plan");

const prisma = new PrismaClient();

// List API keys
router.get("/", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: req.org.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
      }
    });
    res.json(keys);
  } catch (err) {
    console.error("List API Keys Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create API key
router.post("/", authenticateToken, requireRole(["ADMIN"]), checkApiKeyLimit, async (req, res) => {
  const { name, scopes, environment } = req.body; // environment: live or test

  if (!name || !scopes) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const prefix_part = crypto.randomBytes(4).toString("hex"); // 8 chars
    const secret_part = crypto.randomBytes(16).toString("hex"); // 32 chars
    
    const env_prefix = environment === "live" ? "ck_live" : "ck_test";
    const prefix = `${env_prefix}_${prefix_part}`;
    const full_key = `${prefix}_${secret_part}`;
    
    const hashedSecret = await bcrypt.hash(secret_part, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        prefix,
        hashedSecret,
        scopes: Array.isArray(scopes) ? scopes.join(",") : scopes, // Support both array and CSV string
        organizationId: req.org.id,
      }
    });

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      secret: full_key, // Return full key ONLY ONCE
      createdAt: apiKey.createdAt,
    });
  } catch (err) {
    console.error("Create API Key Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete (revoke) API key
router.delete("/:id", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    // Ensure key belongs to user's org
    const key = await prisma.apiKey.findUnique({
      where: { id: req.params.id },
    });

    if (!key || key.organizationId !== req.org.id) {
      return res.status(404).json({ error: "API key not found" });
    }

    await prisma.apiKey.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "API key revoked successfully" });
  } catch (err) {
    console.error("Delete API Key Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
