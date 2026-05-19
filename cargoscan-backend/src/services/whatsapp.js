const eventBus = require("../lib/events");
const { queue } = require("../lib/queue");
const { LIMITS } = require("../lib/planLimits");

const prisma = require("../lib/prisma");

// Template parameter builders for Meta Cloud API
const TEMPLATE_PARAMS = {
  cargo_received: (v) => [
    { type: "text", text: v.customerName || "Customer" },
    { type: "text", text: v.trackingCode || "N/A" },
    { type: "text", text: v.dimensions || "N/A" },
    { type: "text", text: String(v.cbm ?? "N/A") },
    { type: "text", text: String(v.cost ?? "N/A") },
  ],
  shipment_departed: (v) => [
    { type: "text", text: v.customerName || "Customer" },
    { type: "text", text: v.shipmentCode || "N/A" },
    { type: "text", text: v.from || "Origin" },
    { type: "text", text: v.to || "Destination" },
    { type: "text", text: String(v.estimatedDays || "N/A") },
  ],
  cargo_arrived: (v) => [
    { type: "text", text: v.customerName || "Customer" },
    { type: "text", text: v.trackingCode || "N/A" },
    { type: "text", text: v.port || "Port" },
    { type: "text", text: v.expectedClearance || "TBD" },
  ],
  dispute_opened: (v) => [
    { type: "text", text: v.customerName || "Customer" },
    { type: "text", text: v.trackingCode || "N/A" },
  ],
  dispute_review_pending: (v) => [
    { type: "text", text: v.customerName || "Customer" },
    { type: "text", text: v.trackingCode || "N/A" },
  ],
};

async function sendViaMeta(to, templateName, vars) {
  const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!phoneId || !token) throw new Error("Meta WhatsApp env vars not configured");

  // Strip leading + if present (Meta expects no + prefix)
  const normalizedTo = to.replace(/^\+/, "");

  const paramFn = TEMPLATE_PARAMS[templateName];
  const parameters = paramFn ? paramFn(vars) : [];

  const body = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en_US" },
      components: [{ type: "body", parameters }],
    },
  };

  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(data)}`);
  }
  return data?.messages?.[0]?.id || "meta_sent";
}

async function sendViaTwilio(to, templateName, vars) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
  if (!sid || !token) throw new Error("Twilio env vars not configured");

  const paramFn = TEMPLATE_PARAMS[templateName];
  const params = paramFn ? paramFn(vars).map(p => p.text).join(", ") : templateName;
  const body = `[${templateName}] ${params}`;
  const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const formData = new URLSearchParams({
    From: from,
    To: normalizedTo,
    Body: body,
  });

  const credentials = Buffer.from(`${sid}:${token}`).toString("base64");
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Twilio API error: ${JSON.stringify(data)}`);
  }
  return data.sid;
}

async function send(to, templateName, vars) {
  const provider = process.env.WHATSAPP_PROVIDER || "meta";
  let status = "SENT";
  let providerRef = null;
  let errorMessage = null;

  if (vars?.orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: vars.orgId },
      select: { plan: true },
    }).catch(() => null);
    const plan = org?.plan || "TRIAL";
    if (!LIMITS[plan]?.whatsapp) {
      status = "SKIPPED";
      errorMessage = `WhatsApp not enabled for ${plan} plan`;
    }
  }

  const hasMetaCreds = (process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN) && (process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasTwilioCreds = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;

  if (status === "SKIPPED") {
    console.log(`[WhatsApp] SKIPPED — ${errorMessage}. Template: ${templateName}, to: ${to}`);
  } else if (!hasMetaCreds && !hasTwilioCreds) {
    console.log(`[WhatsApp] SKIPPED — no provider credentials configured. Template: ${templateName}, to: ${to}`);
    status = "SKIPPED";
  } else {
    try {
      if (provider === "twilio" || (!hasMetaCreds && hasTwilioCreds)) {
        providerRef = await sendViaTwilio(to, templateName, vars);
      } else {
        providerRef = await sendViaMeta(to, templateName, vars);
      }
      console.log(`[WhatsApp] Sent ${templateName} to ${to} via ${provider} (ref: ${providerRef})`);
    } catch (err) {
      status = "FAILED";
      errorMessage = err.message;
      console.error(`[WhatsApp] Failed to send ${templateName} to ${to}:`, err.message);
    }
  }

  // Always write to NotificationLog
  try {
    await prisma.notificationLog.create({
      data: {
        type: "WHATSAPP",
        recipient: to,
        template: templateName,
        status,
        providerRef,
        errorMessage,
        payload: JSON.stringify(vars),
      },
    });
  } catch (logErr) {
    console.error("[WhatsApp] Failed to write NotificationLog:", logErr.message);
  }

  return { status, providerRef };
}

// Event listeners
eventBus.on("scan.created", async (data) => {
  if (!data.consigneePhone) return;
  try {
    await queue.add("whatsapp.notify", {
      to: data.consigneePhone,
      templateName: "cargo_received",
      vars: {
        orgId: data.orgId,
        customerName: data.consigneeName,
        trackingCode: data.trackingCode || data.certificateUrl,
        dimensions: data.dimensions,
        cbm: data.cbm,
        cost: data.cost,
      },
    });
  } catch (err) {
    console.error("[WhatsApp] scan.created handler error:", err.message);
  }
});

eventBus.on("shipment.in_transit", async (data) => {
  if (!data.consigneePhones?.length) return;
  for (const phone of data.consigneePhones) {
    try {
      await queue.add("whatsapp.notify", {
        to: phone,
        templateName: "shipment_departed",
        vars: {
          orgId: data.orgId,
          customerName: data.consigneeName,
          shipmentCode: data.shipmentCode,
          from: data.from,
          to: data.to,
          estimatedDays: data.estimatedDays,
        },
      });
    } catch (err) {
      console.error("[WhatsApp] shipment.in_transit handler error:", err.message);
    }
  }
});

eventBus.on("shipment.arrived", async (data) => {
  if (!data.consigneePhones?.length) return;
  for (const phone of data.consigneePhones) {
    try {
      await queue.add("whatsapp.notify", {
        to: phone,
        templateName: "cargo_arrived",
        vars: {
          orgId: data.orgId,
          customerName: data.consigneeName,
          trackingCode: data.shipmentCode,
          port: data.to,
          expectedClearance: data.expectedClearance,
        },
      });
    } catch (err) {
      console.error("[WhatsApp] shipment.arrived handler error:", err.message);
    }
  }
});

eventBus.on("dispute.opened", async (data) => {
  if (!data.consigneePhone) return;
  try {
    const templateName = data.status === "REVIEW" ? "dispute_review_pending" : "dispute_opened";
    await queue.add("whatsapp.notify", {
      to: data.consigneePhone,
      templateName,
      vars: {
        orgId: data.orgId,
        customerName: data.consigneeName,
        trackingCode: data.trackingCode,
      },
    });
  } catch (err) {
    console.error("[WhatsApp] dispute.opened handler error:", err.message);
  }
});

console.log("[WhatsApp] Service loaded — queue listeners registered");

module.exports = { send };
