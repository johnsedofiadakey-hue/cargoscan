const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { requireSuperAdmin } = require("../middleware/superAdmin");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/organizations", requireSuperAdmin, async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        _count: {
          select: { users: true, shipments: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    
    const formatted = orgs.map(org => ({
      ...org,
      usage: {
        users: org._count.users,
        ships: org._count.shipments,
      }
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/subscriptions", requireSuperAdmin, async (req, res) => {
    try {
        const subs = await prisma.subscription.findMany({
            include: { organization: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(subs);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/audit-logs", requireSuperAdmin, async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            include: { organization: { select: { name: true, slug: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
