const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

const requireSuperAdmin = (req, res, next) => {
  const adminKey = req.headers["x-admin-key"];
  // For development prototype fallback to checking JWT role as well
  if (adminKey === process.env.SUPER_ADMIN_KEY || (req.user && req.user.role === 'SUPER_ADMIN')) {
    return next();
  }
  return res.status(403).json({ error: "Unauthorized. Super Admin access required." });
};

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

module.exports = router;
