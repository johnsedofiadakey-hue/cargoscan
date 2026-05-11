# CargoScan — Antigravity Output Audit

Audited: 2026-05-10
Source: `~/.gemini/antigravity/scratch/cargoscan`
Against: `CARGOSCAN-PRODUCTION-ROADMAP.md` (Phases 0–6) and what I had
shipped during our session.

---

## TL;DR

**Roughly 45 % of the roadmap got built — but with critical functional gaps
and several security issues that need fixing before this can take real
customers.**

The good news: most of the *scaffolding* is in the right shape (schema
extends correctly, routes exist with sensible names, middleware files are
where they should be). The bad news: a lot of it is **inert** — files that
look complete on inspection but don't actually do anything end-to-end.

| Surface | Status |
|---|---|
| Phase 0 (foundations) | ✅ Mostly carried over |
| Phase 1 (API + WhatsApp + events) | ⚠️ Half — API key auth exists, WhatsApp + events + dispatcher + audit + scan certs are MISSING |
| Phase 2 (revenue + comms) | ⚠️ Routes exist but middleware not wired; billing has correctness bugs; email has no templating layer |
| Phase 3 (hardening) | ⚠️ Refresh tokens exist but flow has security holes; rate limit exists but isn't wired; tenant middleware exists but isn't wired |
| Phase 4 (iOS) | ❌ Only photo-upload network call added; no Login/Keychain/offline queue |
| Phase 5 (legal/ops) | ❌ Not started |
| Phase 6 (marketing/CI) | ❌ Not started |

Backend syntax-checks cleanly; the package boots; that's not the question.
The question is whether each promised feature actually fires when used.

---

## What was carried over correctly

- **Prisma schema** has `Consignee`, `ApiKey`, `Webhook`, `WebhookDelivery`,
  `ScanCertificate`, plus `CargoItem.consigneeId`, `CargoItem.description`,
  `ScanResult.source`, `ScanResult.apiKeyId`. (Field naming diverged in
  places — see Critical Issues §F below.)
- **Middleware exists** for `apiKey`, `either`, `plan`, `rateLimit`, `tenant`.
- **Routes exist** for `apiKeys`, `webhooks`, `consignees`, `tracking`,
  `billing`, `users`.
- **Services exist** for `storage`, `paystack`, `email`, `disputes`, `redis`,
  `scheduler`.
- **`/api/health`** does probe Postgres + Redis (inline in `index.js`).
- **Refresh tokens** in Redis with rotation. (But the route flow has bugs —
  see §B below.)
- **`scheduler.js`** for trial-ending emails — nice addition, I had this on
  the Phase 2 list but hadn't shipped it; you have.
- **iOS NetworkService** gained a `getUploadUrl()` method for the photo
  upload flow.

---

## Critical issues — fix before going live

### A. WhatsApp + webhook dispatcher + event bus are MISSING

This is the single biggest gap. Phase 1's whole architectural payoff was the
**event-driven fan-out**: one `POST /api/scans` triggers a WhatsApp to the
consignee + an HMAC-signed webhook to every subscribed partner + an audit
log row + a tamper-proof certificate.

In the Antigravity build:

- ❌ No `src/services/whatsapp.js` — Meta / Twilio integration absent.
- ❌ No `src/services/webhookDispatcher.js` — webhooks CRUD exists but
  nothing actually delivers events to subscriber URLs. **Creating a webhook
  does nothing.** This will be the first thing a partner notices.
- ❌ No `src/lib/events.js` — no event bus. So even if WhatsApp existed, it
  couldn't subscribe.
- ❌ No `src/lib/audit.js` — `AuditLog` schema exists but **zero routes
  write to it**. The whole compliance / Super Admin Audit Logs tab story is
  dead.
- ❌ No `src/lib/scanCertificate.js` — `ScanCertificate` schema exists but
  `routes/scans.js` never creates one. So `/api/tracking/_verify/:hash`
  will **always 404**. The "Verified by CargoScan" trust badge has nothing
  backing it.

**Impact:** Trial customers can scan, but no one gets a WhatsApp, no partner
gets a webhook, no audit log forms. The viral loop and the trust loop are
both broken.

### B. Auth flow security holes

In `src/routes/auth.js`:

```js
// POST /api/auth/refresh
const { userId, refreshToken } = req.body;        // ← userId from body
const key = `rt:${userId}:default`;
const storedHash = await redis.get(key);
const isMatch = await bcrypt.compare(refreshToken, storedHash);
```

```js
// POST /api/auth/logout
const { userId } = req.body;                       // ← unauthenticated!
await redis.del(`rt:${userId}:default`);
```

Two problems:

1. **`/logout` accepts any `userId` and revokes their refresh token** with
   no authentication. Anyone who knows or guesses a userId can log out any
   user. Fix: require `authenticateToken` on logout and derive `userId`
   from `req.user.id`.

2. **`/refresh` accepts `userId` from the request body** instead of binding
   it to the refresh token. The refresh token alone should identify the
   user. Encode `userId` inside the token (e.g. `userId.tokenId.secret`)
   and reject mismatches. Otherwise this becomes a brute-force surface.

3. **Single-device refresh tokens** (`rt:userId:default`). If the user logs
   in on their laptop, then their iPhone, the iPhone overwrites the laptop's
   refresh — laptop is silently logged out on next refresh. Use
   `rt:userId:<deviceId>` or `rt:userId:<random>`, keyed by token id.

### C. Plan enforcement is defined but never applied

`src/middleware/plan.js` exports `checkPlanExpiration` and
`checkShipmentLimit`. **Neither is mounted on any route.**

- `routes/shipments.js` still uses only `authenticateToken,
  requireRole(["ADMIN", "SUPERVISOR"])`. No `checkShipmentLimit`. A TRIAL
  org can create 1,000 shipments.
- `routes/items.js` has no plan check. No `itemsPerMonth` cap. No
  `consigneeId` accept.
- `routes/users.js` has no `users` cap.
- `routes/apiKeys.js` has no `apiKeys` cap.
- `routes/webhooks.js` has no `webhooks` cap.
- No `trial_expired` 402 ever fires anywhere.

**Impact:** The whole point of plans — the lever you pay for — doesn't
exist functionally.

### D. Webhook signature verification is broken

`src/routes/billing.js`:

```js
router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  // Note: This assumes express.json() is used and we are stringifying it back.
  // In production, use express.raw() for webhook routes to get the exact raw body.
  const rawBody = JSON.stringify(req.body);
  if (!paystack.verifyWebhook(rawBody, signature)) {
```

`JSON.stringify(req.body)` does **not** produce byte-equivalent output to
what Paystack signed (whitespace, key order, escape sequences). The
signature will fail to match in many real payloads. Fix: mount the webhook
route with `express.raw({ type: "application/json" })` **before** the
global `express.json()` and verify against the raw bytes.

The same comment is in the file as a TODO. It needs doing.

### E. Per-API-key rate limiter exists but is not wired

`src/middleware/rateLimit.js` is a clean implementation but is never
imported by `src/index.js` and never applied to any route. API keys are
unlimited in practice. Either mount it globally before route handlers or
import it inside each route.

The middleware also reads `req.apiKey.rateLimit` — that column doesn't
exist on the `ApiKey` model. The defaults will always apply. (Add the
column, or remove the read.)

### F. Schema regression: `Consignee` is no longer per-shipment

```prisma
model Consignee {
  ...
  organizationId  String
  organization    Organization @relation(...)
  // no shipmentId
}
```

In the original design, consignees lived **per shipment** because the
Ghana use case is group consolidation — different containers have
different cost contexts and different mixes of customers. The Antigravity
schema flattens consignees into an org-wide address book.

This breaks:

- "Customers tab inside Shipment detail" — you'd have to filter manually.
- `GET /api/consignees?shipmentId=…` — won't work, no relation.
- DB-level safety: a `CargoItem` can be linked to a `Consignee` from a
  different shipment than the item's. Nothing stops it.

**Fix:** add `shipmentId` to `Consignee`, make the relation
`shipment → consignees`, change route filtering. Bigger:

- Reverse the data direction. Either consignees are per-shipment (my
  original) or per-org with a join table for "this shipment includes
  these consignees". Either works; the current half-state doesn't.

### G. ScanCertificate is never created

`POST /api/scans` updates the cargo item and writes a `ScanResult`, then
calls `disputes.evaluate()`, then returns. **It never writes a
`ScanCertificate`.** So:

- `/api/tracking/_verify/:hash` always 404s.
- Customers can't verify their scan.
- The whole trust story (the differentiator) doesn't work.

Add a tiny `lib/scanCertificate.js`:

```js
function issue({ cargoItemId, scanResultId, payload }) {
  const canonical = JSON.stringify(canonicalize(payload));
  const hash = sha256(canonical);
  return prisma.scanCertificate.upsert({
    where: { hash },
    update: {},
    create: { cargoItemId, hash, payload: canonical, ... },
  });
}
```

…and call it from `routes/scans.js` POST.

### H. `scans.js` uses `authenticateToken` only, not `authenticateEither`

So API key holders cannot POST scans. The "partner integration submits a
scan" path is closed off. Fix: switch to `authenticateEither`,
`requireScope("scans:write")` and accept `req.apiKey?.id` on the
ScanResult.

Also: the new `source` field is never set on writes (defaults to LIDAR
always), and `apiKeyId` is never persisted on the scan even when the call
came via API key. Drops the audit trail for partner-submitted scans.

### I. Storage local-mode upload is a stub

`routes/scans.js` near line 146:

```js
router.put("/upload-local", async (req, res) => {
  const { key } = req.query;
  // Placeholder for local file write
  res.json({ message: "File uploaded successfully (simulated)", key });
});
```

It says "uploaded successfully" but doesn't write the bytes anywhere. The
PUT body is silently discarded. The subsequent `publicUrl` returns 404
when fetched.

Either delete the local mode and require Supabase, or write the bytes to
`./uploads/<key>` and serve them via a GET handler in the same router.

### J. Missing endpoints from Phase 0/1

- `GET /api/auth/me` — frontend uses this to rehydrate the session on
  reload. Without it, the user is logged out on every full refresh.
- No webhook dispatcher service — `Webhook` rows exist but events never
  ship.
- No `/api/users/me/change-password` — users can't change their own
  password.

### K. Hard-coded super-admin credentials remain in the bundle

`cargoscan-production.jsx` still contains the literal password
`"Cs#Platform2026!"` in plaintext at line ~194. It's a 1,675-line file
that **isn't imported into the build**, so it's dead code shipping a
secret. Delete it or move it to `docs/` and scrub the credential.

`auth.js` line 100 also has the credential hardcoded:

```js
if (email === "admin@cargoscan.app" && password === "Cs#Platform2026!") {
```

Move to `process.env.SUPER_ADMIN_EMAIL` + bcrypt-hashed
`process.env.SUPER_ADMIN_PASSWORD_HASH`. Rotate the actual password.

### L. Frontend Phase 2 work didn't happen

`cargoscan-app/src/App.jsx` is unchanged from the day-one prototype except
that the two duplicate-key `minHeight` warnings **reverted** (line 522 and
726). The `DevelopersPanel.jsx` and `CustomersPanel.jsx` panel files I
left in `src/panels/` are gone. No public tracking page route. No
Developers tab. No Customers tab. No billing-upgrade UI.

Net: the user (forwarder admin) cannot create API keys, manage webhooks,
add consignees, or upgrade their plan from the dashboard.

### M. iOS Phase 4 mostly didn't happen

Only `NetworkService.getUploadUrl()` was added. **Missing:**

- Login screen + Keychain storage (still using `UserDefaults`).
- Shipment + consignee picker (replacing the type-the-itemId-by-hand flow).
- Offline scan queue (Core Data).
- Refresh-token flow on 401.

`CargoClassifier.swift` exists but is **entirely commented out**
(wrapped in `/* ... */`). It references a `CargoClassifier.mlmodel` that
isn't in the project. Currently dead code.

---

## Important but not security-critical

### N. Email service has no templating layer

`services/email.js` takes a literal `html` string from each caller.
Every route that wants to send email has to inline HTML, which leads to
copy-paste drift and hardcoded English. I'd recommend:

- A `services/emailTemplates/<name>.js` folder exporting
  `subject(vars)` / `html(vars)` / `text(vars)` per template.
- `email.send({ to, template: "welcome", vars: { name, orgName, slug } })`.

This is the pattern I had shipped. Five templates needed: `welcome`,
`team_invite`, `password_reset`, `trial_ending`, `payment_failed`.

### O. Welcome email is never sent on signup

`auth.js` `POST /signup` does not call `email.send(...)`. The 5-email
onboarding sequence from the roadmap is not implemented.

`users.js` `POST /` (admin invites a worker) also doesn't email the temp
password — just returns it in the response. So if the admin closes the
tab before copying, the only path is `POST /:id/reset-password`.

### P. Billing currency / plan-code defects

`routes/billing.js`:

- Does not specify `currency` on the Paystack init call. Paystack falls
  back to the account default — your spec is "GHS for Ghana, USD for
  partner-API resellers." This needs to be explicit.
- Amounts: `STARTER: 2900` is ambiguous between GHS 29 and $29. If GHS,
  that's ~$2.40 (too cheap). Either set `currency: "GHS", amount: 35000`
  (GHS 350) or `currency: "USD", amount: 2900` ($29).
- Does not pass `plan: <PLN_xxx>` (Paystack plan code), so this creates a
  one-off transaction every month rather than a recurring subscription.
  Customers will have to upgrade manually each cycle.
- Webhook handler only flips `Organization.plan`. **Never writes a
  `Subscription` row.** Audit trail for billing is empty.
- Webhook handler doesn't email on `invoice.payment_failed`. The
  `payment_failed` template should exist + be triggered.

### Q. Tenant middleware exists but is never mounted

`middleware/tenant.js` (verifies `x-organization-slug` matches the
authenticated org) is defined but `index.js` never `app.use()`s it. So
the multi-tenant subdomain story is one-line-from-existing-but-not-wired.

If you do mount it, the SPA needs to send the slug header on every
request, and `/api/tracking/*` (public) needs to skip the check.

### R. No request-ID middleware

Debugging across logs + Sentry traces is painful without a `request.id`
chained through. Add a top-of-stack middleware that sets `req.id` from
incoming `x-request-id` or generates one, and stamps `X-Request-Id` on
every response.

### S. CORS allowlist is hard-coded, no wildcard

`index.js`:

```js
const allowedOrigins = [
  "http://localhost:5173",
  "https://cargoscan-app-2026.web.app",
  process.env.FRONTEND_URL
].filter(Boolean);
```

When you go to `slug.cargoscan.app` per-org subdomains in Phase 3, this
will start blocking your own SPA. Add a regex check for
`/^https:\/\/[a-z0-9-]+\.cargoscan\.app$/`.

Also: `/api/tracking` and the billing webhook should be carved out of
the allowlist since they're meant to be reachable from anywhere /
Paystack's IPs respectively.

### T. API key format is brittle

`middleware/apiKey.js` splits on `_`:

```js
const parts = key.split("_");
if (parts.length < 4) { ... }
const prefix = `${parts[0]}_${parts[1]}_${parts[2]}`;
const secret = parts[3];
```

The full key looks like `ck_live_abcd1234_<32 hex>` and Antigravity reads
`parts[3]` for the secret — if someone ever appends another `_`-segment
to the format (env hint, key version, anything), the parser silently
breaks and we'd be reading the wrong substring. Use a single dot
separator (`ck_live_abcd1234.<32 hex>`) or a `.split("_", 4)` style
parse. Mine used dot.

### U. Package.json hasn't been updated for the new dependencies

Code does `require("@sendgrid/mail")`, `require("@supabase/supabase-js")`,
`require("ioredis")` — all inside try/catch — but `package.json` doesn't
list them. In production:

- SendGrid path silently falls through to the console-mock email — emails
  never send.
- Supabase calls throw at runtime.
- ioredis path falls through to the in-memory mock — fine for one process,
  catastrophic when you scale to multiple Node workers.

Fix: `npm i @sendgrid/mail nodemailer @supabase/supabase-js ioredis` and
commit `package.json` + `package-lock.json`.

### V. Schema status enum drift

`Dispute.status` schema comment says `OPEN, RESOLVED, REJECTED` but
`disputes.evaluate()` writes `REVIEW`. Works at the DB level because
status is a free-form String, but the comment is now misleading. Either
add `REVIEW` to the comment or normalize. Same for any code that filters
by these statuses — the dashboard will need to handle REVIEW.

---

## Cleanup / hygiene

- `cargoscan-production.jsx` — 1,675-line dead prototype with the
  super-admin password in plaintext. Delete or scrub.
- `cargoscan-ios/` — duplicate of `cargoscan-ios-project/Cargoscan/`.
  The Xcode project references only the inner folder. Delete outer.
- `extracted_new/`, `v3_final/`, `v3_update/`, `files (1).zip` — old
  zip dumps. ~600 KB of dead weight.
- `CargoClassifier.swift` — entire file is wrapped in `/* ... */`.
  Either uncomment + add the `.mlmodel` artefact, or delete.
- Backend `package.json` still has empty `description`, `author`,
  `license`. Test script still exits 1. Same `eslint` script as before.
- `docker-compose.yml` uses `version: '3.8'` — Docker has deprecated that
  field. Harmless but spammy in logs.

---

## Prioritized fix list (in order)

I'd attack it in this order. Each item is roughly a half-day to a day of
work for one engineer who's already in the code.

### P0 — security fixes that need to land before any external user

1. Authenticate `/api/auth/logout` and derive `userId` from `req.user.id`.
2. Bind `userId` into the refresh token itself so `/api/auth/refresh`
   doesn't accept it from the request body.
3. Mount `express.raw({ type: "application/json" })` on
   `/api/billing/webhook` and verify against raw bytes.
4. Move super-admin credentials out of `auth.js` line 100 and out of the
   dead `cargoscan-production.jsx`. Rotate the password.

### P1 — close the functional gaps from Phase 1

5. Re-introduce `src/services/whatsapp.js` with Meta + Twilio + 5
   templates.
6. Re-introduce `src/services/webhookDispatcher.js` with HMAC signing +
   retries + delivery logging.
7. Re-introduce `src/lib/events.js` (event bus) so the above can react.
8. Re-introduce `src/lib/scanCertificate.js` and call it from
   `routes/scans.js` POST.
9. Re-introduce `src/lib/audit.js` and call it from every mutating route.
10. Switch `routes/scans.js` to `authenticateEither` +
    `requireScope("scans:write")`. Persist `apiKeyId` and `source` on
    the scan.

### P2 — wire the Phase 2/3 middleware that's already built but inert

11. Apply `checkPlanExpiration` + `checkShipmentLimit` to the right
    routes. Add `checkItemsLimit`, `checkUsersLimit`, `checkApiKeyLimit`,
    `checkWebhookLimit`.
12. Mount `middleware/rateLimit.js` after auth in `index.js`.
13. Mount `middleware/tenant.js` (or decide not to — but make a call).
14. Add wildcard `*.cargoscan.app` to the CORS allowlist.
15. Add request-ID middleware.

### P3 — schema + billing fixes

16. Add `shipmentId` to `Consignee`. Make consignees per-shipment.
17. Fix billing: explicit `currency`, real GHS / USD amounts, use plan
    codes for recurring subscriptions, write `Subscription` rows on
    webhook, email on payment failure.
18. Email templating layer + `welcome` / `team_invite` / `password_reset`
    / `trial_ending` / `payment_failed` templates. Wire `welcome` into
    signup and `team_invite` into the user-create flow.

### P4 — frontend Developers + Customers tabs

19. The two panel components I had at `cargoscan-app/src/panels/` need
    to be re-created and wired into `App.jsx` as tabs visible to
    `ADMIN` users only. Spec is in the production roadmap.

### P5 — iOS Phase 4

20. Login screen, Keychain storage, refresh-token flow on 401, offline
    scan queue, shipment + consignee picker. The photo-upload network
    call you've already added is one piece.

### P6 — public tracking SPA page + Phase 5 + Phase 6

21. As per the roadmap.

---

## What I think the right way forward is

You have two reasonable options:

**Option A — Keep Antigravity's output and patch it.** Roughly a week
of focused work to do P0 + P1 + P2 + P3 above. Net result is the same
end-state I was building toward, just by a longer path. The biggest cost
is re-introducing the event-bus / WhatsApp / webhook-dispatcher / scan
certificate / audit log files that aren't there.

**Option B — Merge mine in.** I had `services/whatsapp.js`,
`services/webhookDispatcher.js`, `lib/events.js`, `lib/audit.js`,
`lib/scanCertificate.js`, `lib/refreshTokens.js`, `lib/apiKeys.js`,
`routes/health.js`, `routes/storage.js`, and full email templates in my
checkout. If you pull those over alongside Antigravity's `paystack.js`,
`scheduler.js`, and (after fixing) `auth.js`, you skip a couple of days
of re-implementation. The only conflict is naming (your schema named
`hashedSecret` where mine had `hash`, etc.) — those are mechanical
renames once you've decided which side to keep.

Either way, the P0 security fixes need to land first. They're small but
they're the kind of thing that costs you a customer when they're
discovered post-launch.

---

## My recommended next 60 minutes

1. Diff your `cargoscan-backend/src` against what I had shipped (you can
   `cp -r ~/Cowork/cargoscan/cargoscan-backend/src ./antigravity-vs-cowork/`
   and `diff -ruN`). Decide per-file which version to keep.
2. Make a single commit that:
   - Pulls in `services/whatsapp.js`, `services/webhookDispatcher.js`,
     `lib/events.js`, `lib/audit.js`, `lib/scanCertificate.js`,
     `lib/refreshTokens.js`, `lib/apiKeys.js` from mine.
   - Keeps `scheduler.js` and `paystack.js` from Antigravity.
   - Adds the four P0 security fixes inline.
3. Run `npm install` so the new deps land in `package-lock.json`.
4. Commit. Push. Restart.

That gets you to a state where Phase 1 + Phase 2 are honestly complete
and you can move on to Phase 4 (iOS) and the frontend tabs without
backfilling.

---

Sources:
- `cargoscan-backend/src/**/*.js` (mounted from
  `/Users/truth/.gemini/antigravity/scratch/cargoscan`)
- `cargoscan-backend/prisma/schema.prisma`
- `cargoscan-backend/prisma/seed.js`
- `cargoscan-backend/.env.example`
- `cargoscan-app/src/App.jsx`
- `cargoscan-ios-project/Cargoscan/*.swift`
- The original production roadmap, gap analysis, and Phase 1 status
  documents.
