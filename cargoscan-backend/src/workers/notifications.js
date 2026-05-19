require("dotenv").config();

const { Worker } = require("bullmq");
const logger = require("../lib/logger");
const { connection, queueName } = require("../lib/queue");
const webhookDispatcher = require("../services/webhookDispatcher");
const whatsapp = require("../services/whatsapp");
const email = require("../services/email");

async function processJob(job) {
  const { name, data } = job;

  if (name === "webhook.deliver") {
    return webhookDispatcher.dispatch(data.orgId, data.event, data.payload);
  }

  if (name === "whatsapp.notify") {
    return whatsapp.send(data.to, data.templateName, data.vars || {});
  }

  if (name === "email.send") {
    return email.send(data);
  }

  throw new Error(`Unknown notification job: ${name}`);
}

if (!connection) {
  logger.warn("Notification worker not started because REDIS_URL is not configured");
} else {
  const worker = new Worker(queueName, processJob, { connection });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name }, "notification job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err }, "notification job failed");
  });

  logger.info({ queueName }, "notification worker started");
}
