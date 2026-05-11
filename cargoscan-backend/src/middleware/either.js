const { authenticateToken } = require("./auth");
const { authenticateApiKey } = require("./apiKey");

const authenticateEither = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const apiKeyHeader = req.headers["x-api-key"];
  
  const token = apiKeyHeader || (authHeader && authHeader.split(" ")[1]);

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token or API key" });
  }

  // If it starts with ck_, it's an API key
  if (token.startsWith("ck_")) {
    return authenticateApiKey(req, res, next);
  } else {
    // Otherwise assume it's a JWT
    return authenticateToken(req, res, next);
  }
};

module.exports = { authenticateEither };
