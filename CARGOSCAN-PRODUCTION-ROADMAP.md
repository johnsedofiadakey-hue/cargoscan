# CargoScan — Production Roadmap

The complete engineering, operations, security, legal, and go-to-market playbook
from where we are today through general availability.

Read alongside:
- `CARGOSCAN-GAP-ANALYSIS.md` — what was missing on day one.
- `CARGOSCAN-PHASE1-STATUS.md` — what's been built so far.

---

## 0. Where we are today

**Built:** multi-tenant Express + Prisma backend; tamper-proof scan certificates;
public tracking endpoint; group-consolidation consignees; full developer API
(API keys, webhooks, scopes); WhatsApp service (Meta + Twilio fallback);
internal event bus; Gemini wrapper; React + Vite web app skeleton with login
+ signup wired; SwiftUI + ARKit LiDAR measurement engine.

**Not yet built:** Paystack billing, email service, photo storage, dispute
auto-detection, plan/trial enforcement, refresh tokens, rate-limit Redis
backend, frontend Developers/Customers tabs, public tracking SPA route, iOS
login + offline queue, deployment, monitoring, compliance, marketing site.

**Target end state:** A Ghana-registered SaaS where any freight forwarder can
sign up, take a 7-day trial, pay via MTN MoMo, scan cargo with a LiDAR
iPhone, send WhatsApp updates to consignees, expose a tracking page to their
customers, and offer their own developer API to partners — with all of it
running on a £/$ tens-per-month hosting bill until ~50 paying orgs.

---

## 1. Phase plan at a glance

| Phase | Outcome | Wall-clock |
|-------|---------|------------|
| 0 (done) | Repo boots, demo accounts log in | 1–2 days |
| 1 (done) | API + WhatsApp + tracking + consignees backend | 1–2 weeks |
| **2** | **Money flows. Photos stored. Disputes auto-flag. Dashboard tabs for Devs + Customers.** | **2–3 weeks** |
| **3** | **Production hardening: refresh tokens, plan enforcement, real `/health`, monitoring, public tracking SPA.** | **1–2 weeks** |
| **4** | **iOS production: login, Keychain, offline queue, TestFlight, App Store.** | **2 weeks** |
| **5** | **Launch readiness: ToS, Privacy, Ghana DPA, backups, runbooks, status page.** | **1 week** |
| **6** | **GTM + growth: marketing site, referrals, analytics, support tooling.** | **2 weeks** |

Total realistic time-to-paid-customers from today: **~10–12 weeks of focused
work for one full-stack engineer**, or **~6–8 weeks** with a frontend dev
helping in parallel from Phase 2 onward.

---

## 2. Phase 2 — Revenue & Communications

Goal: end-to-end demo for a paying customer. Forwarder signs up → starts
trial → adds a consignee → scans cargo → consignee gets WhatsApp with a
photo → forwarder upgrades to Business plan via Paystack MoMo → first MRR.

### 2.1  Photo storage (Supabase Storage)

Why first: every other Phase-2 feature (WhatsApp message body, tracking page,
dispute photos) needs the photo URL to actually point at something.

**Provider choice:** Supabase Storage. Reasons over S3: free tier covers the
first 1 GB and 2 GB egress/month; signed URLs work the same way; one less AWS
account to manage; the Supabase project also doubles as a Postgres backup
mirror later if you want.

**Backend tasks**
1. `npm i @supabase/supabase-js`
2. `src/services/storage.js` — wrap two methods only:
   - `presignUpload({ key, mimeType }) → { uploadUrl, expiresAt, publicUrl }`
   - `getPublicUrl(key)`
   Falls back to a local `STORAGE_PROVIDER=local` mode that writes to
   `./uploads/` for dev.
3. New route `POST /api/scans/:cargoItemId/photo`:
   - Body: `{ mimeType: "image/jpeg", filename?: string }`
   - Returns: `{ uploadUrl, key, publicUrl, expiresAt }`
   - The client (iOS or web) does a direct `PUT` to `uploadUrl` so we don't
     proxy bytes through our API.
4. New route `PATCH /api/scans/:scanResultId` (admin/operator) → set
   `photoUrl: publicUrl` once upload completes.
5. Re-issue the scan certificate when `photoUrl` is set the first time, so the
   hash includes the photo.

**iOS tasks** (in `cargoscan-ios-project/Cargoscan/NetworkService.swift`)
1. Add `requestPhotoUpload(cargoItemId, mimeType) → presigned URL`.
2. After scan, `URLSession` PUT the JPEG to the presigned URL, then PATCH the
   scan with the public URL.

**Web tasks** — none yet; the web app's manual-entry flow can show photos
after iOS / partners populate them.

**Acceptance**
- A scan from the iOS app produces a photo viewable at
  `https://<project>.supabase.co/storage/v1/object/public/cargoscan-photos/<key>`
- The same URL appears on `/api/tracking/:code` for that shipment.

### 2.2  Dispute auto-detection

Why now: makes the trust story end to end. As soon as a second scan arrives
for an item, we either auto-resolve or open a dispute and notify everyone.

**Backend**
1. `src/services/disputes.js` exporting one function:
   ```js
   async function evaluate(cargoItemId, newCbm, scanId, orgId) { … }
   ```
   Logic:
   - Read previous scans (`source != "MANUAL"` only, i.e. the LiDAR / partner truth scans).
   - If there's no prior scan, return.
   - Compute `gap = abs(prev.cbm - newCbm) / max(prev.cbm, newCbm)`.
   - `gap < 0.05` → upsert a `Dispute` row with status `RESOLVED` and notes "Auto-approved (<5% gap)". Emit `dispute.resolved`.
   - `0.05 ≤ gap < 0.10` → create `Dispute` with status `REVIEW`. Emit `dispute.opened`. WhatsApp template `dispute_review_pending`.
   - `gap ≥ 0.10` → create `Dispute` with status `OPEN`. Emit `dispute.opened`. WhatsApp template `dispute_opened`.
2. Hook from `routes/scans.js` POST after the certificate is issued:
   ```js
   await disputes.evaluate(cargoItem.id, data.cbm, scan.id, req.org.id);
   ```
3. Add 2 new WhatsApp templates (`dispute_opened`, `dispute_review_pending`)
   to `services/whatsapp.js` and to your Meta Business template approval list.

**Acceptance**
- Two scans on the same item with 7% CBM gap → `Dispute` row with
  `status="REVIEW"` and a WhatsApp log entry.
- Same with 12% gap → `status="OPEN"` and `dispute_opened` template logged.

### 2.3  Plan + trial enforcement

Why now: the moment you take money, plans matter.

**Backend**
1. `src/middleware/plan.js`:
   - Reads `req.org.plan`, `req.org.planExpiresAt`.
   - If `planExpiresAt` past and plan is `TRIAL` → 402 with
     `{ error: "Trial expired. Upgrade to continue.", code: "trial_expired" }`.
   - For each writable resource, check the per-plan cap *before* the create.
2. Caps live in `src/lib/planLimits.js`:
   ```js
   const LIMITS = {
     TRIAL:      { users: 2, shipmentsPerMonth: 5,  itemsPerMonth: 50,  whatsapp: false, disputes: false },
     STARTER:    { users: 3, shipmentsPerMonth: 30, itemsPerMonth: Infinity, whatsapp: false, disputes: false },
     BUSINESS:   { users: 10, shipmentsPerMonth: 200, itemsPerMonth: Infinity, whatsapp: true, disputes: true },
     ENTERPRISE: { users: Infinity, shipmentsPerMonth: Infinity, itemsPerMonth: Infinity, whatsapp: true, disputes: true },
   };
   ```
3. Apply the middleware at the route level in `shipments.js`, `items.js`,
   and the user-invite route (Phase 2.4) — not globally, because GETs should
   stay free. When over-limit, return `429 { error, code: "plan_limit", limit, used }`.
4. WhatsApp service should consult `LIMITS[plan].whatsapp` and silently log a
   `SKIPPED` notification for trial/starter orgs.

**Acceptance**
- TRIAL org with 5 shipments this month → 6th create returns 429 with
  `code:"plan_limit"`.
- TRIAL org past `planExpiresAt` → any write returns 402.

### 2.4  Team management endpoints

Without these, the README's "Team" tab is a lie.

**Backend** — `src/routes/users.js`:
- `GET /` — list org users (admin only).
- `POST /` — admin creates an account; system generates a temp password and
  returns it once. Honour the plan cap.
- `PATCH /:id` — update name / role / `active`.
- `POST /:id/reset-password` — generate new temp password (admin).

Audit every action.

### 2.5  Paystack billing

Why now: this is the entire commercial reason the project exists.

**Tasks**
1. `npm i` (Paystack works over plain `fetch`, no SDK needed).
2. Create test plans in Paystack Dashboard:
   - CargoScan Starter   29 USD/month → `PLN_xxx`
   - CargoScan Business  79 USD/month → `PLN_xxx`
   - CargoScan Enterprise 199 USD/month → `PLN_xxx`
   Plus GHS-priced equivalents (≈ 350 / 950 / 2,400 GHS) for MoMo customers
   who don't want USD-denominated billing.
3. `src/services/paystack.js`:
   - `initTransaction({ orgId, plan, billingPeriod, currency, callbackUrl })`
     → returns `authorization_url`.
   - `verifyTransaction(reference)` → updates `Subscription` + `Organization.plan`.
   - `verifyWebhook(rawBody, signature)` → HMAC SHA512 against
     `PAYSTACK_SECRET_KEY` per Paystack docs.
4. `src/routes/billing.js`:
   - `POST /init` (auth, admin) → `{ authorization_url, reference }`.
   - `POST /webhook` (raw body, no auth, but verify Paystack signature)
     → handle `charge.success`, `subscription.create`, `subscription.disable`,
     `invoice.payment_failed`. Be idempotent: every webhook handler reads the
     org by reference and only writes if the new status is later than the old.
   - `POST /override` (super-admin only) → bypass Paystack and set a plan
     manually. Audited.
5. Add `Subscription.providerRef` ↔ Paystack subscription code mapping.
6. **Currency story:** start in GHS for forwarders, USD for partner-facing
   API resellers. Paystack supports both. Display GHS on the upgrade UI,
   convert with daily rates from `https://api.exchangerate.host/latest?base=USD&symbols=GHS`
   (cached 24 h in Redis).
7. **Mobile money UX:** when picking the plan, default the payment-method
   chip to "MTN MoMo / Vodafone Cash" — Paystack's hosted page already shows
   these; just the visual default matters.

**Acceptance**
- Admin clicks "Upgrade to Business" → Paystack hosted page → completes a
  MoMo payment with a sandbox number → webhook marks org `BUSINESS` → next
  request is no longer rate-limited under TRIAL.
- All four webhook events round-trip through `Subscription` correctly.

### 2.6  Email service

**Provider:** SendGrid (60K free emails / month; works in Ghana). Fallback to
SMTP via Nodemailer for self-hosted alternatives later.

**Tasks**
1. `npm i @sendgrid/mail nodemailer`.
2. `src/services/email.js`:
   - `send({ to, template, vars })` with templates:
     - `welcome` — sent on signup.
     - `trial_ending_3d` / `trial_ending_1d` — daily cron checks `planExpiresAt`.
     - `payment_failed` — from Paystack webhook.
     - `team_invite` — when admin creates a worker.
     - `password_reset` — for forgot-password flow.
3. Templates are just inline HTML strings in `src/services/emailTemplates/`.
   Don't use Mailchimp/Customer.io yet — premature.
4. `src/services/scheduler.js` boots a `setInterval` that runs every hour and
   triggers trial-ending emails. Replace with a real cron (Railway cron job
   or `node-cron` package) before launch.

### 2.7  Frontend — Developers tab

**File:** `cargoscan-app/src/App.jsx` — add a `Developers` tab inside the org
admin dashboard, only visible when `user.role === "ADMIN"`.

**Sub-tabs:** `API Keys`, `Webhooks`, `Documentation`.

- **API Keys panel:**
  - Lists keys with `name`, `prefix` (masked), `scopes` chips, last used,
    last IP, environment badge.
  - "Create key" modal: name + scope checkboxes + environment toggle +
    optional expiry. On submit, shows the secret ONCE inside a copy-to-clipboard
    box and a big yellow warning. Subsequent visits show only the prefix.
  - Per-row "Revoke" with double-confirm.

- **Webhooks panel:**
  - Lists endpoints with `name`, `url`, events, last delivery status (badge),
    failure counter.
  - "Add endpoint" modal: name + URL + event multi-select. Returns secret once.
  - Per-row "View deliveries" → drawer showing the last 50 deliveries with
    status / response body, plus a "Replay" button (TODO — Phase 3).

- **Documentation panel:**
  - Render `cargoscan-backend/API.md` server-side via `marked` (or just an
    `<a>` linking to a hosted docs page once it exists).
  - "Test request" widget: a textarea pre-filled with `curl https://api… -H
    Authorization: Bearer <maskedKey>`. Clicking copies with the real key
    when it's still in memory from creation.

### 2.8  Frontend — Customers (consignees) tab

**Where:** inside Shipment detail view in `App.jsx`.

- Lists consignees on this shipment with `name`, `phone`, `email`, opt-in
  toggle, item count, total CBM, estimated cost (CBM × rate).
- "Add consignee" modal.
- Per-item assignment: each cargo item row has a consignee dropdown.
- Bulk reassign: select multiple items → "Reassign to..." action.

### 2.9  Phase-2 acceptance gate

Run a real demo against your local stack:

1. Sign up `Stormglide` (TRIAL).
2. Add Kwame Ofori as a consignee.
3. Scan a box with the iOS app → photo uploads → WhatsApp logged.
4. Hit the trial cap (5 shipments) → 429.
5. Upgrade to BUSINESS via Paystack test card → cap lifts.
6. Generate an API key with `tracking:read` scope.
7. From a separate terminal, `curl` the public tracking endpoint and the
   authenticated `/api/shipments` with the key.
8. Add a webhook pointing at https://webhook.site → trigger a status change
   → see it land with a valid HMAC signature.

If all eight pass, Phase 2 is done.

---

## 3. Phase 3 — Production hardening

Goal: take the working stack and make it operable. The week before you put a
real domain in front of it.

### 3.1  Refresh tokens (Redis-backed)

Replace the 30-day single-token JWT with the README's actual contract.

- Access token: 15 min, in memory (not localStorage in the long run, but
  localStorage is fine for MVP — accept the XSS risk).
- Refresh token: 30 days, opaque random string, stored in Redis under
  `rt:<userId>:<deviceId>` with the value = bcrypt hash of the token.
- New routes:
  - `POST /api/auth/refresh` → exchange refresh token for new access token.
  - `POST /api/auth/logout` → revoke refresh token by deleting the Redis key.
- Rotate on every refresh (one-time use).

### 3.2  Per-API-key rate limits

Redis token bucket keyed by `rl:apikey:<keyId>:<minute>`.

- Defaults: `live = 60 req/min`, `test = 30 req/min`.
- Override per key via `ApiKey.rateLimit` (add column).
- Headers on every API-key response:
  - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- 429 body: `{ error: "Rate limited", retryAfter: <seconds> }`.

### 3.3  Real `/api/health`

Probes:
- `prisma.$queryRaw` SELECT 1.
- Redis `PING`.
- Optionally Paystack `/transaction/totals` (cached 60s).
- Optionally WhatsApp token introspection.

Responds:
```json
{
  "status": "ok",
  "version": "1.4.2",
  "uptime": 84321,
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "paystack": { "status": "ok" },
    "whatsapp": { "status": "ok" }
  }
}
```

503 if any dependency is critical-down.

### 3.4  Public tracking SPA route

In `cargoscan-app/src/`:
- Add a tiny client-side router (or just `window.location.pathname.startsWith("/track/")`).
- A `<TrackingPage />` component that fetches `/api/tracking/:code` and
  renders:
  - Forwarder name + logo (use Gravatar or a placeholder cube for MVP).
  - Status timeline.
  - Per-consignee breakdown.
  - Each item with photo, dimensions, CBM, scan certificate hash.
  - Footer "Verified by CargoScan" with a link to `/verify/:hash`.
- Mobile-first. ~95 % of customers will open the link from WhatsApp on a phone.

### 3.5  Sub-domains for tenants

Goal: `stormglide.cargoscan.app` resolves to the dashboard with the org
preselected.

**Steps**
1. DNS: at your registrar, add `*.cargoscan.app` → your hosting provider
   (Vercel for the SPA, Cloudflare in front of the API).
2. Vercel `vercel.json` → add wildcard domain, point at the SPA.
3. SPA reads `window.location.host`; if a non-`www` subdomain is present,
   send `X-CargoScan-Slug: <slug>` on requests.
4. Backend `src/middleware/tenant.js` (already sketched in the gap analysis):
   on the login flow, prefill the org by slug; on signed-in requests, verify
   the JWT's org matches the slug header (otherwise 403).
5. Public tracking remains at `track.cargoscan.app/:code` — separate Vercel
   project or a `/track/...` rewrite, your call.

### 3.6  Logging + error tracking

- **Sentry.** Free tier covers the early year. `@sentry/node` on backend,
  `@sentry/react` on the web. Sentry release tag = git SHA.
- **Logflare or Logtail.** Pipe `morgan` logs into a structured destination
  with a 7-day retention.
- Add a `requestId` middleware that puts a UUID into every log line and the
  `X-Request-Id` response header.

### 3.7  Backups

- Postgres: managed provider (Neon / Supabase / Render Postgres). Point-in-
  time recovery enabled. Don't roll your own pg_dump cron until you outgrow
  the managed tier.
- Storage: Supabase Storage already replicated. Set up a weekly `gsutil rsync`
  to a cold-tier bucket if you want belt-and-braces.
- Verify restores quarterly. A backup you've never restored is a wish.

### 3.8  Phase-3 acceptance gate

- `https://api.cargoscan.app/api/health` returns 200 and shows all green.
- `https://stormglide.cargoscan.app` loads with the org preselected.
- `https://track.cargoscan.app/SHP-2026-001` renders the public page.
- A 401 from a revoked refresh token forces re-login.
- A burst of 200 requests in a minute on a `live` key returns 429 after the
  60th.
- Sentry shows an error from a deliberately broken endpoint.
- Postgres backup is restorable from yesterday into a scratch DB.

---

## 4. Phase 4 — iOS production

Goal: a TestFlight build forwarders can install today, App Store review
submission within the same week.

### 4.1  Login + Keychain

- New `LoginView.swift` with email + password fields, calling
  `POST /api/auth/login`.
- Store JWT in Keychain via `KeychainAccess` Swift package, NOT
  `UserDefaults` (the current code is wrong on this point).
- On launch, attempt to refresh; if it fails, route to login.
- Add a "Sign Out" affordance in HomeView.

### 4.2  Shipment + consignee picker

- Replace the "type the cargoItemId by hand" flow.
- Pull active shipments via `/api/shipments`; pick one.
- Pull consignees on that shipment; pick one.
- Create a placeholder `CargoItem` via `POST /api/items` (LiDAR scan will
  immediately update its dimensions).

### 4.3  Offline scan queue

- On scan, write a `PendingScan` Core Data entity locally.
- Background `URLSession` task drains the queue.
- Reconnect → exponential-backoff retry (already half-built in
  `NetworkService.swift`).
- Show a small "n unsynced scans" badge in HomeView when offline.

### 4.4  Photo upload

- Right after the scan completes, capture a still image from the AR session,
  request a presigned upload URL from `/api/scans/:itemId/photo`, PUT the
  JPEG, then PATCH the scan with the public URL.
- Compress JPEG to ≤ 800 kB target.

### 4.5  App Store metadata

- Bundle ID: `app.cargoscan.scanner` (or whatever matches your Apple Dev account).
- Privacy declarations:
  - Camera (mandatory).
  - LiDAR is part of camera; mention "AR depth sensing" in the description.
  - Photo library if you ever pick from existing photos.
  - Network — describe the freight-management purpose.
- App Tracking Transparency: NO (you're not tracking across apps; nothing to
  declare).
- Encryption export compliance: yes, only standard iOS encryption (HTTPS).
- Screenshots: scanner screen, dashboard mock, tracking page.
- Marketing URL: `https://cargoscan.app`.

### 4.6  TestFlight distribution

- Add 5–10 beta-test forwarders directly via email.
- Run for 7 days minimum; collect feedback in Linear (Phase 6 §6.4).

### 4.7  Phase-4 acceptance gate

- Beta forwarder installs from TestFlight, signs in, scans 10 boxes (some
  offline), sees them sync when back online.
- Photo URLs visible on the public tracking page.
- One full app-review submission cycle without rejection (or with rejection
  + clean re-submit).

---

## 5. Phase 5 — Launch readiness

Goal: ready to take real customers' real money. Boring but unskippable.

### 5.1  Domains + SSL

- `cargoscan.app` (root + www): marketing site (Phase 6).
- `app.cargoscan.app`: the React dashboard.
- `*.cargoscan.app`: per-org subdomains.
- `track.cargoscan.app`: public tracking SPA.
- `api.cargoscan.app`: backend API.
- `docs.cargoscan.app`: rendered API docs (Phase 6 §6.3).
- `status.cargoscan.app`: status page (Phase 5 §5.5).

Cloudflare for DNS + DDoS for free; Vercel / Railway certs for HTTPS.

### 5.2  Legal documents

These are not optional in Ghana, especially when you're holding payment data
through Paystack and contact data for thousands of consignees.

1. **Terms of Service** — covers SaaS terms, acceptable use, liability cap,
   refund policy, governing law (Ghana).
2. **Privacy Policy** — Ghana Data Protection Act 2012 (Act 843) compliant.
   For EU customers, GDPR-equivalent. Cover lawful basis, retention,
   subprocessors (Paystack, Meta, SendGrid, Supabase).
3. **Data Processing Addendum (DPA)** — optional for early customers; required
   for any enterprise deal.
4. **Acceptable Use Policy** — no use for goods that violate Ghana customs,
   no spam, etc.
5. **Cookie Policy** — short, factual.
6. **Security Statement** — short version of Phase 5.6.

Use Termly, Iubenda, or a Ghanaian lawyer for review (~GHS 3,000–5,000).
Don't ship templates from the internet without local review — Ghana's DPA
has specific requirements (registration with the Data Protection Commission,
appoint a Data Protection Supervisor).

### 5.3  Ghana DPA registration

The Data Protection Commission (DPC) requires data controllers to register.
Cost is around GHS 1,000–5,000 depending on entity size. Lead time ~2 weeks.
Start this in parallel with Phase 2; it's purely paperwork and shouldn't
block engineering.

Once registered:
- Display your registration number in the footer.
- Designate a Data Protection Supervisor (you, for now). Email: `dpo@cargoscan.app`.
- Maintain a register of processing activities.

### 5.4  Security baseline

A pre-launch checklist that doesn't require SOC 2 yet but covers the obvious.

- All HTTPS, HSTS enabled, no mixed content.
- `helmet()` on backend (already done) — enable HSTS, frameguard, etc.
- All passwords bcrypt-hashed (already), cost factor ≥ 10.
- JWT secret is 32+ random bytes, stored in Railway / Vercel env vars, never
  committed.
- Database connection requires SSL (`?sslmode=require`).
- Postgres role for the app has only DML, not DDL, on the production DB.
- `prisma migrate deploy` runs as a separate role with DDL.
- Webhook signing secret is unique per webhook (already), 32+ bytes.
- Paystack webhook signature verification is mandatory (don't accept
  unsigned webhooks).
- Rate limits on `/auth/login` specifically: 5 attempts / 15 min / IP, then
  back-off.
- Email enumeration prevention: signup with an existing email returns the
  same generic "we'll email you" response.
- CORS allowlist is real, not `*`.
- Image upload validates MIME type server-side (not just extension).
- `npm audit` on every PR (CI gate).
- Dependabot or Renovate enabled.
- Secret scanning enabled on the GitHub repo.
- A bug-bounty / security-disclosure policy at `/.well-known/security.txt`.

### 5.5  Status page + on-call

- Status page: BetterStack, StatusPage.io, or Instatus. ~$30/month.
- Pages monitor `https://api.cargoscan.app/api/health` every 30s.
- On-call: PagerDuty or Better Uptime Slack/SMS notifications.
- For solo founder mode, just SMS via Better Uptime is fine.

### 5.6  Operational runbooks

Write these now, not the day they're needed. One markdown file per scenario,
versioned in the repo at `cargoscan-backend/runbooks/`:

1. `db-down.md` — what to do if Postgres is unreachable.
2. `redis-down.md` — what to do if Redis is unreachable (graceful
   degradation: skip rate limits, keep auth working).
3. `paystack-webhook-storm.md` — what to do if Paystack retries flood you.
4. `meta-token-rotation.md` — annual WhatsApp token rotation.
5. `secret-rotation.md` — JWT secret + Paystack key + admin password rotation.
6. `data-export-request.md` — DPA / GDPR data export within 30 days.
7. `data-deletion-request.md` — same, deletion.
8. `incident-response.md` — severity levels, comms templates, postmortem template.

### 5.7  Backups & disaster recovery

- RPO target: 24 h (i.e. accept losing up to a day of writes in worst case).
- RTO target: 4 h (i.e. fully recovered service within 4 h).
- Quarterly DR drill: spin up a fresh DB from yesterday's snapshot, point a
  staging environment at it, log in as `john@stormglide.com`, verify all
  data present.

### 5.8  Phase-5 acceptance gate

- Privacy policy live at `/privacy`.
- Ghana DPC registration acknowledgement received.
- Status page green for 7 consecutive days.
- All runbooks present.
- A successful DR drill with `time` measured.

---

## 6. Phase 6 — Growth

Goal: get to 50 paying organizations.

### 6.1  Marketing site

- Static site at `cargoscan.app`. Framework: Astro or Next.js. Hosted on
  Vercel.
- Sections: Hero, "How it works", Features, Pricing (in GHS + USD), Tracking
  example, Customer logos (once you have any), FAQ, CTA "Start free trial",
  Footer with links to legal docs.
- Localised in English first; reserve `/twi` and `/fr` for Ewe / French
  later.
- SEO basics: every page has unique `<title>` + meta description + Open Graph
  tags. JSON-LD Organization schema.

### 6.2  Pricing

Phase-1 schema already supports the four tiers. Pricing recommendation for
launch:

| Tier | GHS / month | USD / month | Caps |
|---|---|---|---|
| Trial | 0 (7 days) | 0 (7 days) | 2 users, 5 shipments, 50 items |
| Starter | 350 | 29 | 3 users, 30 shipments, no WhatsApp |
| Business | 950 | 79 | 10 users, 200 shipments, WhatsApp |
| Enterprise | 2,400 | 199 | unlimited, dedicated WhatsApp number |

Annual discount: 2 months free (offer in the upgrade flow).

**Considerations specific to Ghana**
- A weekly micro-tier (`GHS 100 / week`) for very small forwarders that hate
  monthly commitments. Lots of conversions hide here.
- Per-org WhatsApp delivery is paid by you to Meta (~$0.005–0.06 per
  template message depending on conversation type). At Business plan
  ($79 ≈ GHS 950) and ~200 shipments/month with ~5 messages each, that's
  ~1,000 messages × $0.02 ≈ $20. Margin is fine. Track this.

### 6.3  Developer documentation portal

- `docs.cargoscan.app` powered by Mintlify, Docusaurus, or just Astro.
- Render `cargoscan-backend/API.md` plus a separate Webhooks doc, plus
  language-specific quickstarts for Node and PHP (the two languages most
  Ghanaian devs use).
- An "Open in Postman" button.
- Sample apps: a 100-line Node integration showing how to add live tracking
  to a Shopify-style site.

### 6.4  Analytics

- Product analytics: PostHog (self-host on Railway) or Amplitude free tier.
- Event taxonomy:
  - `signup`, `trial_started`, `trial_expired`, `upgrade_clicked`,
    `paystack_init`, `paystack_success`, `scan_created`, `whatsapp_sent`,
    `tracking_view` (public), `api_key_created`, `webhook_delivery`.
- Funnels:
  - Signup → first scan (target < 24 h).
  - Signup → first WhatsApp send (target < 48 h).
  - Trial → paid (target ≥ 30 %).
- Dashboards visible to founder daily; do not share with team until the
  numbers are big enough that they can't be gamed.

### 6.5  Support tooling

- Crisp Chat or Intercom on the dashboard for in-app chat.
- Help Center: Notion or HelpScout. Five articles to start:
  1. "How to scan your first item"
  2. "Adding consignees to a shipment"
  3. "Setting up WhatsApp on the Business plan"
  4. "Issuing API keys"
  5. "Troubleshooting webhooks"

### 6.6  Referral / partner program

- Each forwarder gets a referral code. New signups using it get +7 trial
  days; the referrer gets one month free per converted signup.
- Implementation: a `referrals` table, a hashed `referrerId` cookie on the
  signup page, conversion event in Paystack webhook.

### 6.7  Go-to-market — first 100 forwarders

This isn't engineering; it's outbound. Work it like a sales pipeline.

1. **Hand-list** 200 freight forwarders in Tema, Asafo, Suame, Lapaz,
   Kantamanto, Kumasi. Names + WhatsApp numbers from local directories +
   physical visits.
2. **Cold WhatsApp** (not email — email is dead in this segment) using your
   own product. "Hi {{name}}, this is {{founder}} from CargoScan. We measure
   cargo with iPhone LiDAR and send your customers WhatsApp updates so
   you stop losing time on disputes. Can I show you a 3-minute demo?"
3. **Demo close ratio target:** 1-in-3 demos → trial. 1-in-3 trials → paid.
   So 200 contacts → ~60 demos → ~20 trials → ~6 paying. Repeat until 50.
4. **Logos for the marketing site:** ask the first 5 paying forwarders for
   permission. Half will say yes.

### 6.8  Phase-6 acceptance gate

- 50 paying organizations.
- LTV / CAC > 3.
- p99 latency on `/api/scans` < 500 ms.
- 0 critical incidents in the last 30 days.

---

## 7. Architecture & infrastructure

### 7.1  Deployment topology

```
┌───────────────────────────────────────────────────────────────────┐
│  Cloudflare DNS + WAF (free tier)                                  │
│   *.cargoscan.app  →  Vercel SPA                                   │
│   api.cargoscan.app →  Railway / Render / Fly                      │
│   track.cargoscan.app → Vercel SPA  (separate project, simpler)    │
└────────────────┬─────────────────────────────────┬─────────────────┘
                 │                                 │
       ┌─────────▼──────────┐           ┌──────────▼──────────┐
       │  Vercel (SPA)      │           │  Railway (API)      │
       │  cargoscan-app     │           │  cargoscan-backend  │
       │  Node 22, Vite     │           │  Node 22, Express   │
       └────────────────────┘           └─────────┬───────────┘
                                                  │
                                ┌─────────────────┼─────────────────────┐
                                │                 │                     │
                       ┌────────▼────────┐ ┌──────▼──────┐    ┌─────────▼────────┐
                       │  Neon Postgres  │ │ Upstash     │    │ Supabase Storage │
                       │  (managed)      │ │  Redis      │    │  (photos)        │
                       └─────────────────┘ └─────────────┘    └──────────────────┘
                                                  │
                            ┌─────────────────────┼──────────────────┐
                            │                     │                  │
                  ┌─────────▼────────┐  ┌─────────▼───────┐  ┌───────▼────────┐
                  │  Paystack API    │  │  Meta WhatsApp  │  │  SendGrid SMTP │
                  │  (billing)       │  │  Cloud API      │  │  (email)       │
                  └──────────────────┘  └─────────────────┘  └────────────────┘
```

### 7.2  Hosting choice rationale

| Provider | Service | Why |
|---|---|---|
| Vercel | SPA + marketing site | Best DX, fast CDN, free for hobby tier, $20/mo Pro covers MVP |
| Railway | Express API + Redis instance | Generous free tier, easy postgres + redis add-ons, good for solo founders |
| Neon | Postgres | Branchable Postgres, zero-cost autosuspend, generous free tier |
| Upstash | Redis | Pay-per-request Redis; free tier covers MVP |
| Supabase | Object storage | Free 1 GB; signed URLs; alternative to S3 without an AWS account |
| Cloudflare | DNS + edge | Free; required wildcard SSL |
| Sentry | Errors | Free tier covers solo founder |
| BetterStack | Status + uptime | $30/mo, alerts via SMS |

Total monthly infra at MVP scale: **< $80**. After 50 paying orgs:
**< $300**. Comfortably under 5 % of revenue.

### 7.3  CI / CD

GitHub Actions, two workflows:

- `.github/workflows/test.yml` — runs on every PR. `npm ci`, `npm run lint`,
  `npm test`, `npx prisma validate`. Required check on `main`.
- `.github/workflows/deploy.yml` — runs on push to `main`. Deploys API to
  Railway via `railway up`; SPA via Vercel CLI or webhook.
- Migrations: `prisma migrate deploy` runs as a Railway pre-deploy hook.
- Sentry release tag = git SHA, set in `release.bash` post-deploy.

### 7.4  Environments

| Env | Domain | Database | Notes |
|---|---|---|---|
| Local dev | `localhost` | Docker Postgres | `npm run dev`, seeds |
| Preview | `pr-123.cargoscan.dev` | Neon branch | Per-PR ephemeral |
| Staging | `staging.cargoscan.app` | Neon staging | Last commit on `main` |
| Production | `app.cargoscan.app` | Neon prod | Tagged release |

### 7.5  Database migrations playbook

- Always: `prisma migrate dev --name <change>` locally, commit the SQL.
- Never edit a committed migration. Add a follow-up migration.
- Three-step pattern for any breaking change:
  1. Migration that adds the new column / table, backwards-compatible.
  2. Code release that writes both old and new fields.
  3. Migration that drops the old column.
- Cap any single migration at 10 minutes wall-clock against production. If
  it'll be longer, do it in chunks.

---

## 8. Quality & process

### 8.1  Coding standards

- Backend: `eslint:recommended` + `plugin:node/recommended`. Prettier with
  default settings. No `any` in TypeScript files (none yet, but if we move).
- Frontend: `@vitejs/plugin-react`, `eslint-plugin-react`, no PropTypes
  required.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Branches: `feat/<short>`, `fix/<short>`. Squash-merge.
- One PR = one logical change. PRs older than 3 days get force-rebased or
  closed.

### 8.2  Tests

Phase 2 minimum:
- Backend: Jest. Cover `auth.js` flows, plan-limit middleware, dispute
  evaluator, Paystack webhook signature verification, scan certificate
  determinism.
- Frontend: Vitest + React Testing Library. Cover login + signup flows.
- iOS: XCTest. Cover the measurement engine — geometric edge cases,
  outlier rejection.

Phase 3:
- Add a small integration test suite that boots the API against a
  Docker-Postgres + Docker-Redis combo and runs the Phase-2 acceptance
  scenarios end to end.

Phase 6:
- Add load tests with k6: 100 concurrent operators, 1000 scans/min.
  p95 must stay under 500 ms.

### 8.3  Definition of "done"

A feature ships when:
- Code reviewed and merged on `main`.
- Migration applied to staging and production.
- Tests added or updated.
- Docs (`API.md`, in-app help, `cargoscan-backend/runbooks/` if new failure
  modes) updated.
- Sentry shows no new errors after 24 h on staging.
- The original ticket has a 30-second screencast or screenshot demonstrating
  it works.

### 8.4  Engineering rhythm (solo or small team)

- **Daily:** 30-min triage of Sentry + status page. Pick today's task.
- **Weekly:** Friday review. Close the loop on shipped features. Update
  `CARGOSCAN-PHASE1-STATUS.md` (rename per phase).
- **Monthly:** check infra costs, customer count, churn, feature requests.
- **Quarterly:** DR drill. Security review. Update legal docs if anything
  changed.

---

## 9. Security checklist (consolidated)

- [ ] HTTPS everywhere with HSTS preload.
- [ ] All secrets in env vars, never committed; `.env*` is `.gitignore`'d.
- [ ] JWT secret 32+ random bytes, rotated annually.
- [ ] Refresh tokens are opaque, single-use, Redis-stored as bcrypt hashes.
- [ ] All passwords bcrypt cost ≥ 10.
- [ ] Postgres role separation (DDL role vs DML role).
- [ ] Database connection requires SSL.
- [ ] Webhook signing secrets unique per webhook, 32+ bytes.
- [ ] Paystack webhook HMAC SHA512 verified on every request.
- [ ] Login rate-limited (5 / 15 min / IP) + email enumeration prevention.
- [ ] CORS strict allowlist; tracking endpoint cleanly carved out.
- [ ] CSP header on the SPA: no inline scripts in production.
- [ ] File uploads validated server-side (MIME + size + magic bytes).
- [ ] SQL exclusively via Prisma — no raw queries with user input.
- [ ] Audit log on every privileged action.
- [ ] Dependabot or Renovate enabled.
- [ ] `npm audit` is a CI gate.
- [ ] Secret scanning enabled on the repo.
- [ ] `.well-known/security.txt` published.
- [ ] Annual external pentest (~$3–5K once you have 50+ customers).
- [ ] No PII in logs (especially passwords, full credit cards, full
      WhatsApp message bodies). Redact at the morgan level.
- [ ] Backup encryption at rest (provider default suffices for now).
- [ ] Two-factor for the Cloudflare, Paystack, Vercel, Railway, GitHub root
      accounts. No personal Gmail.

---

## 10. Compliance checklist

### Ghana
- [ ] Data Protection Commission registration (Act 843 of 2012).
- [ ] Data Protection Supervisor appointed.
- [ ] Privacy policy lists all subprocessors and lawful basis.
- [ ] Data subject access requests handled within 30 days.

### EU customers (if you take any)
- [ ] DPA on offer to customers who request one.
- [ ] Data Processing Records.
- [ ] Cross-border transfer mechanism documented (SCCs).

### Industry / payments
- [ ] Paystack contract in place (auto-on-signup).
- [ ] No card numbers ever stored on CargoScan systems (use Paystack-hosted
      pages — already the plan).
- [ ] PCI scope avoided — let Paystack be the PCI-DSS-compliant party.

---

## 11. Hiring & team scaling

When to add what (one engineer can run Phases 0–4 alone):

| Stage | Role | Why |
|---|---|---|
| 1 paying org | Founder + 1 part-time dev | Speed |
| 5 paying orgs | + Customer support (PT) | One person to triage WhatsApp inbound |
| 15 paying orgs | + Frontend dev (FT) | Founder shouldn't be polishing CSS |
| 25 paying orgs | + Backend dev (FT) | API + integration partners |
| 50 paying orgs | + Sales / BD lead | Outbound at scale |
| 75 paying orgs | + DevOps / infra | Cost optimisation, on-call rotation |

Salaries to budget at Ghana market rates (2026):
- Junior FT engineer: GHS 6,000–10,000/mo.
- Senior FT engineer: GHS 12,000–25,000/mo.
- Customer support PT: GHS 2,500–4,000/mo.
- Sales BD lead: GHS 8,000–15,000/mo + commission.

---

## 12. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta delays WhatsApp Business approval | High | High | Twilio fallback already in code; ship with Twilio + apply Meta in parallel |
| Paystack outage during a launch | Med | Med | Show degraded "try again in a few minutes" message; queue retries |
| Cedi devaluation outpaces USD pricing | High | Med | Bill in GHS, peg internal accounting in USD, review pricing quarterly |
| iPhone Pro adoption too slow in target market | Med | High | Bundle a refurb iPhone 12 Pro into Business plan; use manual + photo-evidence flow as backup |
| Forwarder pretends scans aren't theirs to dispute a customer | Low | Med | Scan certificates + audit log + GPS coordinates make this verifiable |
| Customer screenshots a fake CBM and disputes the forwarder | Low | Med | Public verify endpoint; "Verified by CargoScan" badge defeats this |
| Sandbox sandbagged by Prisma binary CDN block | Already realised | Low | Run migrations on the local laptop; in CI, the binaries are reachable |
| Apple App Store rejects iOS app for AR description | Low | Low | Be precise in privacy declarations; cite ARKit + LiDAR explicitly |
| Customer data breach | Low | Catastrophic | Minimum-data principle, encryption at rest (provider), incident-response runbook, security.txt for disclosure, breach notification to DPC within 72 h |

---

## 13. Cost model

### Pre-revenue (months 1–3)

| Line | Monthly |
|---|---|
| Vercel Pro | $20 |
| Railway (API + Redis + Postgres start tier) | $20 |
| Neon Postgres (free tier) | 0 |
| Supabase Storage | 0 |
| Sentry (free tier) | 0 |
| BetterStack uptime | $30 |
| SendGrid (free tier) | 0 |
| Domain + email | $20 |
| Apple Developer | $8 (annualised) |
| Total | **~$100/mo** |

### Post-launch with 25 paying orgs (months 4–9)

Assume average GHS 700/mo (~$58) per org × 25 = ~$1,450 MRR.

| Line | Monthly |
|---|---|
| Vercel Pro | $20 |
| Railway | $80 |
| Neon Postgres (Pro) | $69 |
| Supabase | $25 |
| Sentry (Team) | $26 |
| BetterStack | $40 |
| SendGrid (Pro) | $20 |
| Meta WhatsApp messages | ~$50 |
| Other (domains, monitoring, misc) | $30 |
| Total infra | **~$360/mo** |
| Gross margin | **~75 %** |

### 50 paying orgs

~$2,900 MRR. Infra ~$700/mo. Gross margin ~76 %.

---

## 14. Two-week rolling milestones

A concrete way to plan the next ~10 weeks of work, sprintless and solo.

| Sprint (2 wks) | Focus |
|---|---|
| 1 | Phase 2.1 photo storage + 2.2 dispute auto-detection |
| 2 | Phase 2.3 plan enforcement + 2.5 Paystack init/webhook (test mode) |
| 3 | Phase 2.6 email + 2.7 Developers tab |
| 4 | Phase 2.8 Customers tab + Phase 2 acceptance gate |
| 5 | Phase 3.1 refresh tokens + 3.2 rate limits + 3.3 health |
| 6 | Phase 3.4 public tracking SPA + 3.5 sub-domains + 3.6 logging |
| 7 | Phase 4.1 iOS login/Keychain + 4.2 picker + 4.3 offline queue |
| 8 | Phase 4.4 photo upload + 4.5 store metadata + TestFlight beta |
| 9 | Phase 5 launch readiness (legal, DPC, runbooks, status, backups) |
| 10 | Phase 6.1 marketing site + 6.4 analytics + outbound to first 20 forwarders |

---

## 15. Definition of "general availability"

CargoScan is GA when:

- 5 paying organizations have run for 30+ days.
- TestFlight beta has 20+ active forwarders.
- Sentry shows < 1 error per 1,000 requests over the last 7 days.
- p99 latency on `/api/scans` < 500 ms over 7 days.
- Status page green 99.5 %+ for the last 30 days.
- DPC registration acknowledged.
- Privacy policy + ToS reviewed by Ghanaian counsel.
- iOS app live on the App Store.
- A new dev can clone the repo, follow `cargoscan-backend/README.md`, and
  have a working local stack within 30 minutes.

---

## 16. Single-page checklist (pin this to the wall)

```
Phase 2 — Money & Comms
  □ Photo upload (Supabase)
  □ Dispute auto-detect
  □ Plan + trial enforcement
  □ Team management routes
  □ Paystack init + webhook (test mode)
  □ Email (welcome + trial-ending)
  □ Frontend Developers tab
  □ Frontend Customers tab
  □ Phase-2 demo end-to-end

Phase 3 — Production hardening
  □ Refresh tokens (Redis)
  □ Per-key rate limits
  □ Real /api/health
  □ Public tracking SPA route
  □ Sub-domains for tenants
  □ Sentry + log aggregator
  □ Backups verified

Phase 4 — iOS production
  □ Login + Keychain
  □ Shipment + consignee picker
  □ Offline scan queue
  □ Photo upload
  □ App Store metadata
  □ TestFlight (20+ beta forwarders)
  □ App Store submitted

Phase 5 — Launch readiness
  □ All domains + SSL
  □ Privacy + ToS + DPA published
  □ Ghana DPC registered
  □ Security baseline checklist green
  □ Status page live
  □ Runbooks written
  □ DR drill passed

Phase 6 — Growth
  □ Marketing site live
  □ Pricing page (GHS + USD)
  □ Docs portal
  □ Analytics (PostHog)
  □ Support tooling
  □ Referral program
  □ 50 paying orgs
```

---

This document plus `CARGOSCAN-GAP-ANALYSIS.md` and `CARGOSCAN-PHASE1-STATUS.md`
are the three documents you need to hand a new engineer or refer to every
Monday morning. Treat them as living: each merged feature should update the
relevant section, and we should append a "Changelog" at the bottom of the
phase status file every Friday.
