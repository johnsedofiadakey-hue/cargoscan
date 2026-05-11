const eventBus = require("../lib/events");

const templates = {
  welcome: (vars) => `Welcome to CargoScan, ${vars.name}!`,
  scan_created: (vars) => `Your cargo scan is ready! View it here: ${vars.url}`,
  trial_ending: (vars) => `Your trial is ending in ${vars.days} days. Upgrade now!`,
  payment_failed: (vars) => `Payment failed for your invoice. Please check your billing details.`,
  team_invite: (vars) => `You have been invited to join ${vars.orgName}. Login with your email.`,
};

/**
 * Sends a WhatsApp message using a template.
 * @param {string} to - Recipient phone number
 * @param {string} template - Template name
 * @param {object} vars - Variables to fill the template
 */
async function send(to, template, vars) {
  const templateFn = templates[template];
  const message = templateFn ? templateFn(vars) : `Message with template ${template}`;
  
  console.log(`[WhatsApp] Sending to ${to}: "${message}"`);
  
  // In production, integrate with Twilio or Meta WhatsApp API here.
  return { success: true, messageId: `wa_${Math.random().toString(36).substr(2, 9)}` };
}

// Subscribe to events
eventBus.on("scan.created", async (data) => {
  console.log("[WhatsApp] Reacting to scan.created");
  if (data.consigneePhone) {
    await send(data.consigneePhone, "scan_created", { url: data.certificateUrl });
  }
});

module.exports = { send };
