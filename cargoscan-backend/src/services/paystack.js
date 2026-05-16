const crypto = require("crypto");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * Initialize a transaction with Paystack.
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {number} params.amount - Amount in lowest currency unit (e.g., pesewas/kobo)
 * @param {string} params.reference - Unique reference
 * @param {string} params.callbackUrl - URL to redirect to after payment
 */
const initTransaction = async ({ email, amount, reference, callbackUrl }) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set");
  }

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      reference,
      callback_url: callbackUrl,
    }),
  });

  const data = await response.json();
  if (!data.status) {
    throw new Error(data.message);
  }

  return data.data; // Returns { authorization_url, access_code, reference }
};

/**
 * Verify Paystack webhook signature.
 */
const verifyWebhook = (rawBody, signature) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set");
  }

  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (err) {
    return false;
  }
};

module.exports = { initTransaction, verifyWebhook };
