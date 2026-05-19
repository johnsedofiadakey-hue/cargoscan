const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "refreshToken",
      "*.password",
      "*.refreshToken",
    ],
    remove: true,
  },
});

module.exports = logger;
