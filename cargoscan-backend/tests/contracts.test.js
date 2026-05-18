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

test("cargo items support package-first placeholders before scanning", () => {
  const fs = require("node:fs");
  const schema = fs.readFileSync(require.resolve("../prisma/schema.prisma"), "utf8");

  assert.match(schema, /length\s+Float\?/);
  assert.match(schema, /width\s+Float\?/);
  assert.match(schema, /height\s+Float\?/);
  assert.match(schema, /cbm\s+Float\?/);
  assert.match(schema, /scanConfidence\s+Float\?/);
  assert.match(schema, /status\s+String\s+@default\("WAITING_FOR_SCAN"\)/);
});

test("container loading is gated to ready packages", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/routes/containers"), "utf8");

  assert.match(source, /LOADABLE_ITEM_STATUS\s*=\s*"READY_TO_LOAD"/);
  assert.match(source, /Container capacity would be exceeded/);
  assert.match(source, /Package shipment does not match this container shipment/);
});

test("item route exposes package review statuses", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/routes/items"), "utf8");

  for (const status of ["NEEDS_REVIEW", "RESCAN_REQUIRED", "READY_TO_LOAD"]) {
    assert.match(source, new RegExp(status));
  }
});

test("public tracking uses tracking codes instead of raw item IDs", () => {
  const fs = require("node:fs");
  const schema = fs.readFileSync(require.resolve("../prisma/schema.prisma"), "utf8");
  const route = fs.readFileSync(require.resolve("../src/routes/tracking"), "utf8");

  assert.match(schema, /trackingCode\s+String\s+@unique/);
  assert.match(route, /where:\s*{\s*trackingCode:\s*code\s*}/);
  assert.doesNotMatch(route, /where:\s*{\s*id:\s*code\s*}/);
});

test("expired user JWTs use 401 so clients can refresh", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/middleware/auth"), "utf8");

  assert.match(source, /status\(401\)\.json\(\{\s*error:\s*"Invalid or expired token"/);
});

test("developer integration inputs are constrained", () => {
  const fs = require("node:fs");
  const apiKeys = fs.readFileSync(require.resolve("../src/routes/apiKeys"), "utf8");
  const webhooks = fs.readFileSync(require.resolve("../src/routes/webhooks"), "utf8");

  assert.match(apiKeys, /ALLOWED_SCOPES/);
  assert.match(apiKeys, /Invalid scopes/);
  assert.match(webhooks, /ALLOWED_EVENTS/);
  assert.match(webhooks, /private network hosts/);
  assert.match(webhooks, /Production webhook URLs must use https/);
});

test("backend source uses shared Prisma client outside the singleton module", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const srcRoot = path.join(__dirname, "../src");
  const offenders = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      if (fullPath.endsWith(path.join("lib", "prisma.js"))) continue;
      const source = fs.readFileSync(fullPath, "utf8");
      if (source.includes("new PrismaClient") || source.includes("@prisma/client")) offenders.push(fullPath);
    }
  }

  walk(srcRoot);
  assert.deepEqual(offenders, []);
});

test("webhook dispatcher stores bodies and has retry recovery", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/services/webhookDispatcher"), "utf8");

  assert.match(source, /body:\s*rawBody/);
  assert.match(source, /recoverFailedDeliveries/);
  assert.match(source, /status:\s*"RETRYING"/);
});
