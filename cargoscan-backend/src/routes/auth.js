const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

const generateSlug = (name) => {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-").slice(0, 32);
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
      expiresIn: "30d",
    });

    return res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug, plan: result.org.plan },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Handle Super Admin platform login (hardcoded simple check for now, can be improved)
    if (email === "admin@cargoscan.app" && password === "Cs#Platform2026!") {
      const token = jwt.sign({ role: "SUPER_ADMIN" }, process.env.JWT_SECRET, { expiresIn: "10h" });
      return res.json({
        token,
        user: { name: "Platform Admin", email, role: "SUPER_ADMIN" },
        organization: null,
      });
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
      expiresIn: "30d",
    });

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
