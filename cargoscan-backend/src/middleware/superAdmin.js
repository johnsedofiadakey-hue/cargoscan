const jwt = require("jsonwebtoken");

function requireSuperAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey && adminKey === process.env.SUPER_ADMIN_KEY) {
    req.user = { role: "SUPER_ADMIN", authMethod: "admin_key" };
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(403).json({ error: "Unauthorized. Super Admin access required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Unauthorized. Super Admin access required." });
    }

    req.user = { role: "SUPER_ADMIN", authMethod: "jwt" };
    req.org = null;
    return next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired super admin token" });
  }
}

module.exports = { requireSuperAdmin };
