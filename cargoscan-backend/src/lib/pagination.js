function getPagination(query) {
  const requested = query.page !== undefined || query.pageSize !== undefined;
  const page = Math.max(parseInt(query.page || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || "50", 10) || 50, 1), 100);
  return {
    requested,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function sendList(res, rows, total, pagination) {
  if (!pagination.requested) return res.json(rows);
  return res.json({
    data: rows,
    meta: {
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
  });
}

function updatedAfterFilter(value) {
  if (!value) return {};
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return {};
  return { updatedAt: { gt: parsed } };
}

module.exports = { getPagination, sendList, updatedAfterFilter };
