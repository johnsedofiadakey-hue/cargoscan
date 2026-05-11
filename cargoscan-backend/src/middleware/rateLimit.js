const redis = require("../services/redis");

/**
 * Rate limiter for API keys using Redis.
 * Keyed by rl:apikey:<keyId>:<minute>
 */
const rateLimiter = async (req, res, next) => {
  if (!req.apiKey) {
    return next(); // Only rate limit requests authenticated via API key
  }

  const keyId = req.apiKey.id;
  const env = req.apiKey.prefix.startsWith("ck_live") ? "live" : "test";
  
  // Use limit from DB if present, otherwise use defaults
  const limit = req.apiKey.rateLimit || (env === "live" ? 60 : 30);
  
  const currentMinute = Math.floor(Date.now() / 60000);
  const redisKey = `rl:apikey:${keyId}:${currentMinute}`;

  try {
    const count = await redis.incr(redisKey);
    
    if (count === 1) {
      await redis.expire(redisKey, 60); // Expire after 1 minute
    }

    const remaining = Math.max(0, limit - count);

    // Set headers
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", (currentMinute + 1) * 60); // Epoch seconds for next minute

    if (count > limit) {
      const secondsLeft = 60 - Math.floor((Date.now() % 60000) / 1000);
      return res.status(429).json({
        error: "Rate limited",
        retryAfter: secondsLeft,
      });
    }

    next();
  } catch (err) {
    console.error("Rate Limiter Error:", err);
    // Fail open as per roadmap "graceful degradation: skip rate limits"
    next();
  }
};

module.exports = rateLimiter;
