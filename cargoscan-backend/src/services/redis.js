// Note: Requires ioredis to be installed for real Redis connectivity
let Redis;
try {
  Redis = require("ioredis");
} catch (e) {
  Redis = null;
}

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let redis;

if (Redis) {
  redis = new Redis(redisUrl);
  redis.on("error", (err) => console.error("Redis Error:", err));
} else {
  console.warn("ioredis module not found. Using in-memory mock for Redis.");
  const mockData = new Map();
  
  redis = {
    get: async (key) => mockData.get(key) || null,
    set: async (key, value) => { 
      mockData.set(key, value); 
      return "OK"; 
    },
    setex: async (key, seconds, value) => {
      mockData.set(key, value);
      setTimeout(() => mockData.delete(key), seconds * 1000);
      return "OK";
    },
    del: async (key) => { 
      return mockData.delete(key) ? 1 : 0; 
    },
    incr: async (key) => {
      const val = (parseInt(mockData.get(key)) || 0) + 1;
      mockData.set(key, val.toString());
      return val;
    },
    expire: async (key, seconds) => {
      setTimeout(() => mockData.delete(key), seconds * 1000);
      return 1;
    }
  };
}

module.exports = redis;
