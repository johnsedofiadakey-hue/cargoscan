const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const redis = require("../services/redis");
const crypto = require("crypto");
const { authenticateToken } = require("../middleware/auth");
const { verifyFirebaseIdToken } = require("../services/firebaseAdmin");

const router = express.Router();
const prisma = require("../lib/prisma");

const generateSlug = (name) => {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-").slice(0, 32);
};

const issueSession = async (user, organization) => {
  const token = jwt.sign({ id: user.id, role: user.role, orgId: user.organizationId }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  const randomSecret = crypto.randomBytes(40).toString("hex");
  const refreshToken = `${user.id}.${randomSecret}`;
  const hashedRefreshToken = await bcrypt.hash(randomSecret, 10);
  await redis.setex(`rt:${user.id}:default`, 30 * 24 * 60 * 60, hashedRefreshToken);

  return {
    token,
    accessToken: token,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    organization: organization
      ? { id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan }
      : null,
  };
};

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, company, country, city, cbmRate } = req.body;

    if (!name || !email || !password || !company || !country || !city) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const baseSlug = generateSlug(company);
    let slug = baseSlug;
    let slugExists = await prisma.organization.findUnique({ where: { slug } });
    if (slugExists) {
      slug = `${baseSlug}-${Date.now()}`;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Organization and initial User (Admin) within a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: company,
          slug,
          plan: "TRIAL",
          planExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          defaultCbmRate: cbmRate ? parseFloat(cbmRate) : 85.0,
          country,
          city,
        },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      const warehouse = await tx.warehouse.create({
        data: {
          name: `${city} Warehouse`,
          organizationId: org.id,
        },
      });

      return { org, user, warehouse };
    });

    const token = jwt.sign({ id: result.user.id, role: "ADMIN", orgId: result.org.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const randomSecret = crypto.randomBytes(40).toString("hex");
    const refreshToken = `${result.user.id}.${randomSecret}`;
    const hashedRefreshToken = await bcrypt.hash(randomSecret, 10);
    
    // Store in Redis: rt:userId:deviceId
    await redis.setex(`rt:${result.user.id}:default`, 30 * 24 * 60 * 60, hashedRefreshToken);

    // Send welcome email
    const { sendWelcomeEmail } = require("../services/email");
    await sendWelcomeEmail(result.user.email, result.user.name);

    return res.status(201).json({
      message: "Account created successfully",
      token,
      accessToken: token,
      refreshToken,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug, plan: result.org.plan },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/firebase", async (req, res) => {
  try {
    const { idToken, mode = "login", company, country, city, cbmRate } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing Firebase ID token" });

    const decoded = await verifyFirebaseIdToken(idToken);
    const email = decoded.email;
    const name = decoded.name || email?.split("@")[0] || "CargoScan User";
    if (!email) return res.status(400).json({ error: "Google account email is required" });

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (existingUser) {
      if (!existingUser.active) return res.status(401).json({ error: "Account disabled" });
      const session = await issueSession(existingUser, existingUser.organization);
      return res.json(session);
    }

    if (mode !== "signup") {
      return res.status(404).json({
        error: "No CargoScan account exists for this Google email. Choose Create a pilot organization first.",
      });
    }

    if (!company || !country || !city) {
      return res.status(400).json({ error: "Company, country, and city are required for Google signup" });
    }

    const baseSlug = generateSlug(company);
    let slug = baseSlug;
    const slugExists = await prisma.organization.findUnique({ where: { slug } });
    if (slugExists) slug = `${baseSlug}-${Date.now()}`;

    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: company,
          slug,
          plan: "TRIAL",
          planExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          defaultCbmRate: cbmRate ? parseFloat(cbmRate) : 85.0,
          country,
          city,
        },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      const warehouse = await tx.warehouse.create({
        data: {
          name: `${city} Warehouse`,
          organizationId: org.id,
        },
      });

      return { org, user, warehouse };
    });

    const { sendWelcomeEmail } = require("../services/email");
    await sendWelcomeEmail(result.user.email, result.user.name);

    const session = await issueSession(result.user, result.org);
    return res.status(201).json({ message: "Account created successfully", ...session });
  } catch (error) {
    console.error("Firebase auth error:", error);
    return res.status(401).json({ error: "Google sign-in could not be verified" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt with email:", email);

    // Handle Super Admin platform login
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@cargoscan.app";
    const adminHash = process.env.SUPER_ADMIN_PASSWORD_HASH;

    if (email === adminEmail && adminHash) {
      const validPassword = await bcrypt.compare(password, adminHash);
      if (validPassword) {
        const token = jwt.sign({ role: "SUPER_ADMIN" }, process.env.JWT_SECRET, { expiresIn: "10h" });
        return res.json({
          token,
          accessToken: token,
          user: { name: "Platform Admin", email, role: "SUPER_ADMIN" },
          organization: null,
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || (!user.active)) {
      return res.status(401).json({ error: "Invalid credentials or account disabled" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, role: user.role, orgId: user.organizationId }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const randomSecret = crypto.randomBytes(40).toString("hex");
    const refreshToken = `${user.id}.${randomSecret}`;
    const hashedRefreshToken = await bcrypt.hash(randomSecret, 10);
    
    // Store in Redis: rt:userId:deviceId
    await redis.setex(`rt:${user.id}:default`, 30 * 24 * 60 * 60, hashedRefreshToken);

    return res.json({
      token,
      accessToken: token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Refresh Token
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Missing refresh token" });
  }

  const parts = refreshToken.split(".");
  if (parts.length !== 2) {
    return res.status(401).json({ error: "Invalid refresh token format" });
  }
  
  const userId = parts[0];
  const secret = parts[1];

  try {
    const key = `rt:${userId}:default`;
    const storedHash = await redis.get(key);

    if (!storedHash) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const isMatch = await bcrypt.compare(secret, storedHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    const newToken = jwt.sign({ id: user.id, role: user.role, orgId: user.organizationId }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    // Rotate refresh token — prefix with userId. so the parser can extract it next call
    const newRandomSecret = crypto.randomBytes(40).toString("hex");
    const newRefreshToken = `${userId}.${newRandomSecret}`;
    const newHashedRefreshToken = await bcrypt.hash(newRandomSecret, 10);
    await redis.setex(key, 30 * 24 * 60 * 60, newHashedRefreshToken);

    res.json({
      token: newToken,
      accessToken: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error("Refresh Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Session rehydration
router.get("/me", authenticateToken, async (req, res) => {
  try {
    if (req.user.role === "SUPER_ADMIN") {
      return res.json({ user: { name: "Platform Admin", role: "SUPER_ADMIN" }, organization: null });
    }
    return res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
      organization: {
        id: req.org.id,
        name: req.org.name,
        slug: req.org.slug,
        plan: req.org.plan,
        planExpiresAt: req.org.planExpiresAt,
      },
    });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Logout
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    await redis.del(`rt:${userId}:default`);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
