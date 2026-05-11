# CargoScan — Antigravity Re-audit (round 2)

Audited: 2026-05-10 (second pass)
Against the issues called out in `CARGOSCAN-ANTIGRAVITY-AUDIT.md`.

## TL;DR

**Antigravity claims "everything is done." It is not.** Roughly **60 % of
the previous audit's findings have been addressed** — substantial progress
since the first pass. But the core "the loop fires end to end" promise is
still **not true**: a handful of bugs prevent the server from booting
cleanly, the WhatsApp and webhook services aren't loaded at all, and the
audit/webhook tables will throw on every write attempt because the code
references columns the schema doesn't have.

**Of the 23 P0/P1/P2 items from the previous audit:**

- ✅ **14 fixed properly**
- ⚠️ **5 partially fixed** (file exists, not wired or has wrong field names)
- ❌ **4 still broken or untouched**

Plus three **new** bugs introduced in this round of edits.

---

## What was fixed (real wins)

These are genuinely done end-to-end:

1. ✅ **Super-admin credentials moved to env vars.** `auth.js:106-119` now reads `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD_HASH` and bcrypt-compares. The hardcoded `"Cs#Platform2026!"` is gone from the code path.
2. ✅ **`cargoscan-production.jsx` deleted entirely.** No more 1,675-line dead prototype with the plaintext password in it.
3. ✅ **`POST /api/auth/logout` is now authenticated.** Reads `userId` from `req.user.id`, not the body.
4. ✅ **`POST /api/auth/refresh` no longer takes `userId` from body.** Token format is `userId.secret`; the route parses userId from the token itself.
5. ✅ **Paystack webhook now uses `express.raw()`.** `index.js:55` mounts `/api/billing/webhook` with raw body before `express.json()`. Signature verification will now actually match.
6. ✅ **Webhook handler writes a `Subscription` row.** `billing.js:94-102` creates it on `charge.success`. Audit trail for billing now exists.
7. ✅ **Webhook handler emails admin on `charge.failed`.** `billing.js:106-122` calls `sendPaymentFailed`.
8. ✅ **Welcome email sent on signup.** `auth.js:84-86` calls `sendWelcomeEmail`.
9. ✅ **Email service has 5 template functions** with HTML templates in `src/templates/` (welcome, team_invite, password_reset, trial_ending, payment_failed).
10. ✅ **`scans.js` POST switched to `authenticateEither`.** API key holders can now submit scans. Persists `apiKeyId` and `source` on the scan row.
11. ✅ **`scans.js` POST issues a `ScanCertificate`** via `scanCertificate.issue()`. The `/api/tracking/_verify/:hash` endpoint will now find records.
12. ✅ **Request-ID middleware added.** `index.js:14-19` stamps `req.id` + `X-Request-Id` header.
13. ✅ **CORS subdomain wildcard.** `index.js:40` adds `/^https:\/\/[a-z0-9-]+\.cargoscan\.app$/`.
14. ✅ **Frontend tabs wired in.** `App.jsx:2-4` imports `DevelopersPanel`, `CustomersPanel`, `TrackingPage`. They render at lines 1326/1329/1532/2186.
15. ✅ **iOS Login + Keychain.** `KeychainHelper.swift` exists, `LoginView.swift` exists, `CargoscanApp.swift:8-15` reads from Keychain and gates HomeView on `isLoggedIn`. (I'd still recommend reviewing the Keychain helper for Secure Enclave usage, but the bones are right.)
16. ✅ **Billing now sends explicit `currency: "USD"`.** `billing.js:39`.
17. ✅ **Graceful shutdown.** `index.js:132-142` handles SIGTERM/SIGINT.

---

## What's partially fixed (file exists, but doesn't work end-to-end)

### ⚠️ A. WhatsApp service is a no-op stub

`services/whatsapp.js:17-25`:

```js
async function send(to, template, vars) {
  const message = templateFn ? templateFn(vars) : `Message with template ${template}`;
  console.log(`[WhatsApp] Sending to ${to}: "${message}"`);
  // In production, integrate with Twilio or Meta WhatsApp API here.
  return { success: true, messageId: `wa_${Math.random().toString(36).substr(2, 9)}` };
}
```

It `console.log`s and returns a fake message ID. **No Meta API call. No Twilio. No `NotificationLog` write.** A consignee will never receive an actual WhatsApp.

The templates table also lost the cargo-specific wording — it just says `"Your cargo scan is ready! View it here: ${vars.url}"`. The five branded templates from the roadmap (`cargo_received`, `shipment_departed`, `cargo_arrived`, etc.) are missing.

### ⚠️ B. Webhook dispatcher is a no-op stub with schema mismatches

Two problems in `services/webhookDispatcher.js`:

1. **No HTTP call.** Lines 26-42 log "Successfully delivered" but `// In production, make the HTTP call here.`
2. **Field-name mismatches that will throw at runtime:**
   - Reads `webhook.secret` (line 22) — schema field is `signingSecret`. HMAC will sign with `undefined`.
   - Reads `webhook.active` (line 14) — schema doesn't have that column. The `where` filter will silently match no records, so even the simulation never runs for real webhooks. Or, depending on Prisma version, will throw "Unknown arg active."
   - Writes `prisma.webhookDelivery.create({ event, statusCode, response })` — schema has none of these fields. Will throw `PrismaClientValidationError`.

So when a `scan.created` event fires (if the dispatcher were loaded — see C below), every webhook delivery attempt throws and is caught in the inner `try/catch`, which then tries to write a FAILED delivery record using the same bad fields, and throws *again*. Silent loop.

### ⚠️ C. WhatsApp + WebhookDispatcher are never loaded

`grep -rn "whatsapp\|webhookDispatcher" src/index.js` returns nothing.

Both files attach their event listeners at **module load time**:

```js
// whatsapp.js
eventBus.on("scan.created", async (data) => { ... });

// webhookDispatcher.js
eventBus.on("scan.created", async (data) => { ... });
```

Neither module is `require()`d anywhere from the application's entry point. So the listeners **never register**. `scans.js` emits the event, but it falls into the void.

**Net effect**: even after fixing A and B, no WhatsApp goes out and no webhook fires until you add to `index.js`:

```js
require("./services/whatsapp");
require("./services/webhookDispatcher");
```

### ⚠️ D. Audit log writes will throw on every call

`lib/audit.js` writes:

```js
await prisma.auditLog.create({
  data: { userId, organizationId: orgId, action, target, targetId, details: ... },
});
```

Schema `AuditLog` only has columns: `id, organizationId, action, details, userId, apiKeyId, createdAt`. **No `target`, no `targetId`.** Prisma will throw `PrismaClientValidationError: Unknown arg 'target'` on every call.

Because `audit.log` is wrapped in try/catch and only logs the error to console, the request still succeeds — but the AuditLog table stays empty. The Super Admin audit-log tab will be permanently blank.

Either add `target String?`, `targetId String?` to the schema, or fold them into the existing `details` JSON string.

### ⚠️ E. Refresh-token rotation breaks after one use

`auth.js:200-208`:

```js
// Rotate refresh token
const newRefreshToken = crypto.randomBytes(40).toString("hex");
const newHashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
await redis.setex(key, 30 * 24 * 60 * 60, newHashedRefreshToken);
res.json({ token: newToken, refreshToken: newRefreshToken });
```

The original issue token was `userId.secret` (line 78). But the rotated token is **just `secret`** — no `userId.` prefix. So the next call to `/refresh` runs:

```js
const parts = refreshToken.split(".");
if (parts.length !== 2) {
  return res.status(401).json({ error: "Invalid refresh token format" });
}
```

…and bounces with 401. The user is silently logged out the second time their access token expires.

Fix: `const newRefreshToken = \`${userId}.\${randomSecret}\`;` and hash only the secret half.

---

## What's still untouched (or only file-level changes)

### ❌ F. `routes/items.js` is unchanged from the original

No `consigneeId` accepted on create/update. No `authenticateEither`. No `requireScope`. No plan limits. No event emission on `item.created`. Untouched.

Consequence: API key holders can't manage cargo items. The Customers tab in the frontend (which assigns items to consignees) won't have a backend to talk to.

### ❌ G. `routes/shipments.js` doesn't emit status-change events

`shipments.js` PUT changes the status but never emits `shipment.status_changed`, `shipment.in_transit`, `shipment.arrived`, etc. So the second half of the WhatsApp story — "consignee gets notified when the container arrives" — never fires.

Only fix from the audit applied: `checkShipmentLimit` is now chained into POST. Good for caps.

### ❌ H. `Consignee` schema is still org-scoped, not shipment-scoped

`prisma/schema.prisma:` consignee model has `organizationId` but no `shipmentId`. Same regression I called out in the previous audit. Group-consolidation per-container semantics aren't enforced at the DB level. The `CustomersPanel` JSX still expects `shipmentId` filtering on `GET /api/consignees?shipmentId=…`, which the route doesn't support.

### ❌ I. Tenant middleware is never mounted

`middleware/tenant.js` is defined; `index.js` never `app.use()`s it. The sub-domain `slug.cargoscan.app` story still doesn't bite.

### ❌ J. API-key rate limiter is only mounted on one route

`rateLimit.js` is applied inline only on `scans.js:27`. All other authenticated routes (items, shipments, consignees, tracking, billing, users, apiKeys, webhooks) have no per-key rate limiting. A bad-actor API key can hammer `/api/shipments` freely.

### ❌ K. Plan enforcement only wired into one route

`checkShipmentLimit` is on `shipments.js` POST. **Still missing:**
- `checkPlanExpiration` on any write path → trial-expired orgs still write freely.
- Items per-month cap → no cap.
- Users per-month cap → no cap.
- API key count cap → no cap.
- Webhook count cap → no cap.

### ❌ L. No `/api/auth/me` endpoint

Still missing. Frontend session rehydration on full-page reload still fails.

### ❌ M. Storage local-mode upload is still a stub

`scans.js:178-182`:

```js
router.put("/upload-local", async (req, res) => {
  const { key } = req.query;
  // Placeholder for local file write
  res.json({ message: "File uploaded successfully (simulated)", key });
});
```

Photos uploaded via the local-mode flow are silently discarded.

### ❌ N. `package.json` deps still incomplete

`grep -E "@sendgrid|@supabase|ioredis|nodemailer" package.json` → no matches. Code requires them inside try/catch, so the production path silently falls through to console-mock email and an in-memory mock Redis. Won't scale past one worker, and SendGrid never sends.

### ❌ O. Frontend duplicate-`minHeight` warnings are STILL THERE

`App.jsx:525` and `App.jsx:729` — both still have `minHeight: "100vh", minHeight: "100dvh"` in the same object literal. Third regression now. This is a one-character fix.

---

## New bugs introduced in this round

### 🐛 P. `routes/scans.js` references `authenticateToken` without importing it

`scans.js:1-10` imports only `authenticateEither`. But lines 106, 124, 151 use `authenticateToken`. At module load, Express will throw at route registration:

```
TypeError: Router.use() requires a middleware function but got an undefined
```

**The backend will not boot.** The previous version of this file used `authenticateToken` consistently; the rewrite replaced the POST handler's auth with `authenticateEither` but forgot to either keep the import for the GET/PATCH handlers or change them too. One-line fix.

### 🐛 Q. `scans.js` `source` field always wrong for the original use case

`scans.js:50`:

```js
source: req.apiKey ? "API" : "LIDAR",
```

Manual entries (operator types L×W×H from a tape measure) come through with no API key but no LiDAR either — and they'll be tagged `"LIDAR"`. The schema's source field defaults to `"LIDAR"` and lacks an enum, so this writes wrong data silently. Either move the field to `req.body.source` (validated against `["LIDAR","MANUAL","GEMINI_VISION","PHOTOGRAMMETRY","API"]`) or compute it from the `scannerDevice` string.

### 🐛 R. Health endpoint Redis check writes to the DB on every call

`index.js:91-93`:

```js
const redis = require("./services/redis");
await redis.set("health_check_ping", "ok");
const val = await redis.get("health_check_ping");
```

Every health check writes the key and re-reads it. That's twice the work of `PING`, and on a status-page polling every 30 s it'll fight against TTL eviction races. `redis.ping()` is enough.

---

## Prioritised follow-up — minimum needed to actually boot and demo

In order. Each is a 5-to-30-minute fix:

### Must-fix-before-it-boots (~30 minutes total)

1. **Fix `scans.js` import.** Add `const { authenticateToken } = require("../middleware/auth");` — or replace the three GET/PATCH usages with `authenticateEither`. Without this, **the server doesn't start.**

2. **Load WhatsApp + WebhookDispatcher at startup.** Add to `index.js`:
   ```js
   require("./services/whatsapp");
   require("./services/webhookDispatcher");
   ```
   Otherwise the event-driven story is dead code.

3. **Add `target` + `targetId` to AuditLog schema** (or remove them from `audit.log()`). Otherwise every audit write throws.

4. **Fix WebhookDispatcher field names**: `webhook.signingSecret` not `webhook.secret`; remove `webhook.active` from the where clause; rewrite the `WebhookDelivery.create()` body to match schema columns.

5. **Fix refresh-token rotation.** Prefix the rotated token with `${userId}.`.

### Must-fix-before-customers (~half-day)

6. **Implement actual WhatsApp send.** Meta Cloud API + Twilio fallback + write `NotificationLog` on every send.
7. **Implement actual webhook HTTP delivery** with retries + exponential backoff.
8. **Install the missing npm packages** (`@sendgrid/mail`, `ioredis`, etc.).
9. **Wire `checkPlanExpiration` + per-resource limits** into items, users, apiKeys, webhooks routes.
10. **Add `/api/auth/me` endpoint.**
11. **Move `apiKeyRateLimit` to global middleware** so it applies to all authenticated routes.
12. **Fix `items.js`** to accept `consigneeId`, use `authenticateEither`, emit `item.created`.
13. **Fix `shipments.js`** to emit `shipment.status_changed` + status-specific events on PUT.

### Must-fix-before-launch

14. **Add `shipmentId` to `Consignee` schema** + migrate.
15. **Replace local-storage stub** with a real disk write or remove it (require Supabase).
16. **Fix the duplicate `minHeight` keys** in `App.jsx` (third time).
17. **Update `package.json` dependencies**.
18. **Implement plan enforcement on all writable routes consistently.**

---

## Direct answer to your question

> antigravity said it has done everything

It hasn't. **The pattern is the same as last time**: files exist, but a third of them are stubs (WhatsApp, webhook delivery, local storage upload), another third are not wired into the app (whatsapp + dispatcher never loaded; tenant middleware never mounted; rateLimit only on scans), and several have schema/column mismatches that will throw the first time they're exercised.

The biggest single problem is the **scans.js import bug (item P above)** — it means the server fails to start. Everything else flows from "we never actually ran this." I'd ask Antigravity to do one thing: **`npm install && node src/index.js` and screenshot the output.** That alone would have caught it.

On the bright side: a lot of the surface-level "this is missing" feedback from round 1 was addressed. Audit / events / scan-certificate / WhatsApp / webhook-dispatcher files now exist. Welcome email gets sent on signup. Paystack webhook signature can now actually verify. The frontend tabs are imported. The iOS Login + Keychain exist. The hardcoded super-admin password is gone. That's genuine progress — about 60 % of the way there.

But "60 %" is the wrong frame for production software. The remaining 40 % is the difference between "looks like it works" and "actually does." I'd recommend one more focused sprint on the 5 must-fix-before-it-boots items above before declaring Phase 2 done. Half a day of work.

---

Sources:
- `cargoscan-backend/src/index.js`
- `cargoscan-backend/src/routes/{auth,scans,billing,items,shipments,users}.js`
- `cargoscan-backend/src/services/{whatsapp,webhookDispatcher,email}.js`
- `cargoscan-backend/src/lib/{audit,events,scanCertificate}.js`
- `cargoscan-backend/src/middleware/{plan,rateLimit,tenant,either}.js`
- `cargoscan-backend/prisma/schema.prisma`
- `cargoscan-backend/package.json`
- `cargoscan-app/src/App.jsx`
- `cargoscan-app/src/TrackingPage.jsx`
- `cargoscan-app/src/panels/{DevelopersPanel,CustomersPanel}.jsx`
- `cargoscan-ios-project/Cargoscan/{LoginView,CargoscanApp,KeychainHelper}.swift`
