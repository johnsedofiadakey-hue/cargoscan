const express = require("express");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { getPagination, sendList } = require("../lib/pagination");

const router = express.Router();
const prisma = require("../lib/prisma");

router.get("/", authenticateToken, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const pagination = getPagination(req.query);
    const where = {
      organizationId: req.org.id,
      ...(req.query.userId ? { userId: req.query.userId } : {}),
      ...(req.query.action ? { action: req.query.action } : {}),
    };

    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(req.query.from);
      if (req.query.to) where.createdAt.lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(pagination.requested ? { skip: pagination.skip, take: pagination.take } : { take: 100 }),
      }),
      prisma.auditLog.count({ where }),
    ]);

    sendList(res, logs, total, pagination);
  } catch (err) {
    req.log?.error({ err }, "List org audit logs error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
