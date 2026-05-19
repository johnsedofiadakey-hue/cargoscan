const redis = require("../services/redis");

// In-memory fallback when Redis is unavailable: Map<redisKey, {count, expiresAt}>
const memFallback = new Map();

function memIncr(key, ttlSeconds) {
  const now = Date.now();
  const entry = memFallback.get(key);
  if (!entry || entry.expiresAt <= now) {
    memFallback.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

// Prune expired entries periodically to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memFallback) {
    if (v.expiresAt <= now) memFallback.delete(k);
  }
}, 60_000);

/**
 * Rate limiter for API keys using Redis with an in-memory fallback.
 * Keyed by rl:apikey:<keyId>:<minute>
 */
const rateLimiter = async (req, res, next) => {
  if (!req.apiKey) {
    return next(); // Only rate limit requests authenticated via API key
  }

  const keyId = req.apiKey.id;
  const env = req.apiKey.prefix.startsWith("ck_live") ? "live" : "test";
  const limit = req.apiKey.rateLimit || (env === "live" ? 60 : 30);

  const currentMinute = Math.floor(Date.now() / 60000);
  const redisKey = `rl:apikey:${keyId}:${currentMinute}`;

  let count;
  try {
    count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, 60);
  } catch (err) {
    console.error("[RateLimit] Redis unavailable — using in-memory fallback:", err.message);
    count = memIncr(redisKey, 60);
  }

  const remaining = Math.max(0, limit - count);
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", (currentMinute + 1) * 60);

  if (count > limit) {
    const secondsLeft = 60 - Math.floor((Date.now() % 60000) / 1000);
    return res.status(429).json({ error: "Rate limited", retryAfter: secondsLeft });
  }

  next();
};

module.exports = rateLimiter;
