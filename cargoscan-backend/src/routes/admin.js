const express = require("express");
const { requireSuperAdmin } = require("../middleware/superAdmin");
const { getPagination, sendList } = require("../lib/pagination");

const router = express.Router();
const prisma = require("../lib/prisma");

router.get("/organizations", requireSuperAdmin, async (req, res) => {
  try {
    const pagination = getPagination(req.query);
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        include: {
          _count: {
            select: { users: true, shipments: true }
          }
        },
        orderBy: { createdAt: "desc" },
        ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : {}),
      }),
      prisma.organization.count(),
    ]);
    
    const formatted = orgs.map(org => ({
      ...org,
      usage: {
        users: org._count.users,
        ships: org._count.shipments,
      }
    }));
    
    sendList(res, formatted, total, pagination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/subscriptions", requireSuperAdmin, async (req, res) => {
    try {
        const pagination = getPagination(req.query);
        const [subs, total] = await Promise.all([
            prisma.subscription.findMany({
                include: { organization: true },
                orderBy: { createdAt: 'desc' },
                ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : {}),
            }),
            prisma.subscription.count(),
        ]);
        sendList(res, subs, total, pagination);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/audit-logs", requireSuperAdmin, async (req, res) => {
    try {
        const pagination = getPagination(req.query);
        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                include: { organization: { select: { name: true, slug: true } } },
                orderBy: { createdAt: 'desc' },
                ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : { take: 100 }),
            }),
            prisma.auditLog.count(),
        ]);
        sendList(res, logs, total, pagination);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
