// Note: Requires @sendgrid/mail to be installed if using SendGrid
const fs = require("fs");
const path = require("path");
let sgMail;
try {
  sgMail = require("@sendgrid/mail");
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }
} catch (e) {
  sgMail = null;
}

/**
 * Send an email.
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.html - Email body (HTML)
 */
const send = async ({ to, subject, html }) => {
  if (sgMail && process.env.SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to,
        from: process.env.EMAIL_FROM || "noreply@cargoscan.app",
        subject,
        html,
      });
      console.log(`Email sent to ${to} via SendGrid`);
    } catch (err) {
      console.error("SendGrid Email Error:", err);
      // Don't throw, just log
    }
  } else {
    // Fallback or Dev mode
    console.log(`\n--- [EMAIL MOCK] ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${html.substring(0, 100)}... (truncated)`);
    console.log(`--------------------\n`);
  }
};

/**
 * Sends a welcome email to a new user using a template.
 * @param {string} to - Recipient email
 * @param {string} name - Recipient name
 */
const sendWelcomeEmail = async (to, name) => {
  try {
    const templatePath = path.join(__dirname, "../templates/welcome.html");
    let html = fs.readFileSync(templatePath, "utf8");
    
    // Replace placeholders
    html = html.replace("{{name}}", name);
    html = html.replace("{{loginUrl}}", process.env.FRONTEND_URL || "http://localhost:3000/login");
    
    await send({
      to,
      subject: "Welcome to CargoScan!",
      html,
    });
    
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to send welcome email:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Sends a team invitation email with a temporary password.
 */
const sendTeamInvite = async (to, name, loginUrl, tempPassword) => {
  try {
    const templatePath = path.join(__dirname, "../templates/team_invite.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html.replace(/{{name}}/g, name);
    html = html.replace(/{{inviteUrl}}/g, loginUrl);
    html = html.replace(/{{loginUrl}}/g, loginUrl);
    if (tempPassword) {
      html = html.replace(/{{tempPassword}}/g, tempPassword);
      // Inject password block if template doesn't have the placeholder
      if (!html.includes(tempPassword)) {
        html = html.replace("</p>\n    <p>If you did", `</p>\n    <p>Your temporary password is: <strong>${tempPassword}</strong></p>\n    <p>If you did`);
      }
    }

    await send({ to, subject: "You've been invited to join CargoScan!", html });
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to send team invite:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Sends a password reset email.
 */
const sendPasswordReset = async (to, name, resetUrl, tempPassword = null) => {
  try {
    const templatePath = path.join(__dirname, "../templates/password_reset.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html.replace(/{{name}}/g, name);
    html = html.replace(/{{resetUrl}}/g, resetUrl || process.env.FRONTEND_URL || "https://app.cargoscan.app");
    if (tempPassword) {
      html = html.replace(
        "<p>Click the button below to choose a new password.</p>",
        `<p>An administrator reset your password. Use this temporary password to sign in, then update it immediately:</p>
    <p><strong>${tempPassword}</strong></p>`
      );
      html = html.replace(/<p><a href="[^"]*" class="button">Reset Password<\/a><\/p>/, "");
    }
    
    await send({ to, subject: "Reset your CargoScan Password", html });
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to send password reset:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Sends a trial ending email.
 */
const sendTrialEnding = async (to, name, daysLeft, upgradeUrl) => {
  try {
    const templatePath = path.join(__dirname, "../templates/trial_ending.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html.replace("{{name}}", name);
    html = html.replace("{{daysLeft}}", daysLeft);
    html = html.replace("{{upgradeUrl}}", upgradeUrl);
    
    await send({ to, subject: "Your CargoScan Trial is Ending Soon", html });
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to send trial ending email:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Sends a payment failed email.
 */
const sendPaymentFailed = async (to, name, billingUrl) => {
  try {
    const templatePath = path.join(__dirname, "../templates/payment_failed.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html.replace("{{name}}", name);
    html = html.replace("{{billingUrl}}", billingUrl);
    
    await send({ to, subject: "Payment Failed", html });
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to send payment failed email:", err);
    return { success: false, error: err.message };
  }
};

module.exports = { send, sendWelcomeEmail, sendTeamInvite, sendPasswordReset, sendTrialEnding, sendPaymentFailed };
