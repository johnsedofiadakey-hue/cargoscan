/**
 * Middleware to verify that the X-Organization-Slug header matches the authenticated user's organization.
 */
const verifyTenant = (req, res, next) => {
  // Skip check for super admin
  if (req.user && req.user.role === "SUPER_ADMIN") {
    return next();
  }

  const headerSlug = req.headers["x-organization-slug"];
  
  if (!headerSlug) {
    return res.status(400).json({ error: "Missing x-organization-slug header" });
  }

  if (!req.org) {
    return res.status(401).json({ error: "Organization context missing. Ensure auth middleware is run first." });
  }

  if (req.org.slug !== headerSlug) {
    return res.status(403).json({ 
      error: "Tenant mismatch", 
      message: "You do not have access to this organization's data." 
    });
  }

  next();
};

module.exports = verifyTenant;
