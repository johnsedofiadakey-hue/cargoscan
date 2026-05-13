const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { checkPlanExpiration, checkUsersLimit } = require("../middleware/plan");
const { sendTeamInvite } = require("../services/email");

const prisma = new PrismaClient();

// List org users
router.get("/", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.org.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      }
    });
    res.json(users);
  } catch (err) {
    console.error("List Users Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create user (Team member)
router.post("/", authenticateToken, requireRole(["ADMIN"]), checkPlanExpiration, checkUsersLimit, async (req, res) => {
  const { email, name, role } = req.body;

  if (!email || !name || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Generate temp password
    const tempPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        password: hashedPassword,
        organizationId: req.org.id,
      }
    });

    // Send invite email non-blocking
    const loginUrl = process.env.FRONTEND_URL || "https://app.cargoscan.app";
    sendTeamInvite(email, name, loginUrl, tempPassword).catch(e =>
      console.error("[Users] Failed to send team invite email:", e.message)
    );

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tempPassword, // Return ONCE
    });
  } catch (err) {
    console.error("Create User Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user
router.patch("/:id", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  const { name, role, active } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
    });

    if (!user || user.organizationId !== req.org.id) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role, active },
    });

    res.json(updatedUser);
  } catch (err) {
    console.error("Update User Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Reset password
router.post("/:id/reset-password", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
    });

    if (!user || user.organizationId !== req.org.id) {
      return res.status(404).json({ error: "User not found" });
    }

    const tempPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    });

    res.json({ tempPassword: tempPassword });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
