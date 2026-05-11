const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

const authenticateApiKey = async (req, res, next) => {
  const apiKeyHeader = req.headers["x-api-key"] || req.headers["authorization"];
  let key = apiKeyHeader;

  if (!key) {
    return res.status(401).json({ error: "Missing API key" });
  }

  // Handle Bearer token format if passed in Authorization header
  if (key.startsWith("Bearer ")) {
    key = key.split(" ")[1];
  }

  // Expecting format: ck_live_prefix_secret or ck_test_prefix_secret
  const parts = key.split("_");
  if (parts.length < 4) {
    return res.status(401).json({ error: "Invalid API key format" });
  }

  const prefix = `${parts[0]}_${parts[1]}_${parts[2]}`; // e.g., ck_live_abc123
  const secret = parts[3];

  try {
    const apiKeyRow = await prisma.apiKey.findFirst({
      where: { prefix: prefix },
      include: { organization: true },
    });

    if (!apiKeyRow) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const isMatch = await bcrypt.compare(secret, apiKeyRow.hashedSecret);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    // Update last used at
    await prisma.apiKey.update({
      where: { id: apiKeyRow.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach org and scopes to request
    req.org = apiKeyRow.organization;
    req.apiKey = apiKeyRow;
    req.scopes = apiKeyRow.scopes.split(","); // Assuming CSV

    next();
  } catch (err) {
    console.error("API Key Auth Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const requireScope = (scope) => {
  return (req, res, next) => {
    if (!req.scopes || !req.scopes.includes(scope)) {
      return res.status(403).json({ error: `Missing required scope: ${scope}` });
    }
    next();
  };
};

module.exports = { authenticateApiKey, requireScope };
