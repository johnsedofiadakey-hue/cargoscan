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

if (!global.__cargoscanConsoleBridgeInstalled) {
  global.__cargoscanConsoleBridgeInstalled = true;
  const formatArgs = (args) => args.map((arg) => {
    if (arg instanceof Error) return { message: arg.message, stack: arg.stack };
    if (typeof arg === "object") return arg;
    return String(arg);
  });
  console.log = (...args) => logger.info({ console: true, args: formatArgs(args) }, args.map(String).join(" "));
  console.warn = (...args) => logger.warn({ console: true, args: formatArgs(args) }, args.map(String).join(" "));
  console.error = (...args) => logger.error({ console: true, args: formatArgs(args) }, args.map(String).join(" "));
}

module.exports = logger;
