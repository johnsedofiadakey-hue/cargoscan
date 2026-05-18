const emailService = require("./email");
const prisma = require("../lib/prisma");

/**
 * Start the background scheduler.
 */
const startScheduler = () => {
  console.log("Scheduler started (hourly interval)...");
  
  // Run every hour
  setInterval(async () => {
    console.log("Running hourly scheduler tasks...");
    await checkExpiringTrials();
  }, 60 * 60 * 1000);
};

/**
 * Check for organizations with expiring trials and send emails.
 */
const checkExpiringTrials = async () => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    // Find orgs expiring in the next 3 days
    // Note: A real implementation would store a flag so we don't spam emails every hour.
    // For this demo, we just find them.
    const expiringOrgs = await prisma.organization.findMany({
      where: {
        plan: "TRIAL",
        planExpiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        }
      },
      include: { users: { where: { role: "ADMIN" } } }
    });

    for (const org of expiringOrgs) {
      for (const admin of org.users) {
        await emailService.send({
          to: admin.email,
          subject: "Your CargoScan trial is ending soon",
          html: `<p>Hi ${admin.name},</p><p>Your trial for <strong>${org.name}</strong> is ending soon (Expires at: ${org.planExpiresAt}).</p><p>Upgrade to a paid plan to continue using CargoScan.</p>`,
        });
      }
    }

  } catch (err) {
    console.error("checkExpiringTrials Error:", err);
  }
};

module.exports = { startScheduler };
