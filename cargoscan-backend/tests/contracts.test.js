const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");

test("plan limits keep trial constrained and business pilot-ready", () => {
  const { LIMITS } = require("../src/lib/planLimits");

  assert.equal(LIMITS.TRIAL.shipmentsPerMonth, 5);
  assert.equal(LIMITS.TRIAL.itemsPerMonth, 50);
  assert.equal(LIMITS.TRIAL.whatsapp, false);
  assert.equal(LIMITS.BUSINESS.whatsapp, true);
  assert.equal(LIMITS.ENTERPRISE.shipmentsPerMonth, Infinity);
});

test("Paystack webhook signatures use HMAC SHA512", () => {
  process.env.PAYSTACK_SECRET_KEY = "test_secret";
  delete require.cache[require.resolve("../src/services/paystack")];
  const { verifyWebhook } = require("../src/services/paystack");
  const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref_1" } });
  const signature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");

  assert.equal(verifyWebhook(rawBody, signature), true);
  assert.equal(verifyWebhook(rawBody, "bad_signature"), false);
});

test("local storage URLs point at the public scan upload route", async () => {
  process.env.STORAGE_PROVIDER = "local";
  process.env.API_PUBLIC_URL = "http://localhost:5000";
  delete require.cache[require.resolve("../src/services/storage")];
  const storage = require("../src/services/storage");

  const result = await storage.presignUpload({ key: "cargo_photo.jpg", mimeType: "image/jpeg" });

  assert.equal(result.uploadUrl, "http://localhost:5000/api/scans/upload-local?key=cargo_photo.jpg");
  assert.equal(result.publicUrl, "http://localhost:5000/api/scans/uploads/cargo_photo.jpg");
});

test("canonical API route mounts are present", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/index"), "utf8");
  for (const route of ["/api/auth", "/api/shipments", "/api/items", "/api/scans", "/api/consignees", "/api/users", "/api/keys", "/api/webhooks", "/api/billing", "/api/tracking", "/api/admin"]) {
    assert.match(source, new RegExp(`app\\.use\\("${route.replace(/\//g, "\\/")}`));
  }
});
