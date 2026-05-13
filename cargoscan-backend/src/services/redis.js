let Redis;
try {
  Redis = require("ioredis");
} catch (e) {
  Redis = null;
}

const mockData = new Map();

const inMemoryMock = {
  get: async (key) => mockData.get(key) ?? null,
  set: async (key, value) => { mockData.set(key, value); return "OK"; },
  setex: async (key, seconds, value) => {
    mockData.set(key, value);
    const ms = seconds * 1000;
    if (ms <= 2147483647) setTimeout(() => mockData.delete(key), ms);
    return "OK";
  },
  del: async (key) => (mockData.delete(key) ? 1 : 0),
  incr: async (key) => {
    const val = (parseInt(mockData.get(key) || "0", 10)) + 1;
    mockData.set(key, String(val));
    return val;
  },
  expire: async (key, seconds) => {
    const ms = seconds * 1000;
    if (ms <= 2147483647) setTimeout(() => mockData.delete(key), ms);
    return 1;
  },
  ping: async () => "PONG",
};

if (Redis && process.env.REDIS_URL) {
  const client = new Redis(process.env.REDIS_URL);
  client.on("error", (err) => console.error("[Redis] Error:", err.message));
  module.exports = client;
} else {
  if (!process.env.REDIS_URL) {
    console.warn("[Redis] REDIS_URL not set — using in-memory mock (not suitable for production)");
  } else {
    console.warn("[Redis] ioredis not installed — using in-memory mock");
  }
  module.exports = inMemoryMock;
}
