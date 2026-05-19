const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("./logger");

const queueName = process.env.NOTIFICATION_QUEUE_NAME || "cargoscan-notifications";
let connection = null;
let queue = null;

if (process.env.REDIS_URL) {
  connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
} else {
  logger.warn("REDIS_URL not set; notification queue is running in local no-op mode");
  queue = {
    async add(name, data) {
      logger.info({ job: name, event: data?.event }, "queued notification job locally");
      return { id: `local-${Date.now()}` };
    },
  };
}

module.exports = { queue, connection, queueName };
