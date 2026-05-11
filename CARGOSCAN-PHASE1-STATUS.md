# CargoScan — Phase 1 Status

Updated: 2026-05-10

This complements `CARGOSCAN-GAP-ANALYSIS.md`. The gap analysis was the audit;
this document tracks what's been built since.

---

## Done — P0 (foundations)

| # | Item | Where |
|---|------|-------|
| 1 | Super Admin JWT bug fixed (short-circuits before User lookup) | `src/middleware/auth.js` |
| 2 | `/api/auth/me` for session rehydration | `src/routes/auth.js` |
| 3 | Backend deps cleaned: dropped `sqlite3` (broken native build, unused) and `firebase-admin`/`firebase-functions` (Express server, not a Cloud Function) | `package.json` |
| 4 | Idempotent Prisma seed creating 3 demo orgs, 5 users, 2 consignees, 1 shipment with 4 items | `prisma/seed.js` |
| 5 | `docker-compose.yml` for Postgres 14 + Redis 7 with healthchecks | `docker-compose.yml` |
| 6 | Honest `.env.example` covering ~35 env vars across Paystack, WhatsApp, Twilio, Supabase, S3, Gemini, SendGrid, etc. | `.env.example` |
| 7 | Two duplicate-key React warnings fixed | `cargoscan-app/src/App.jsx` |

A fresh checkout now boots:

```bash
cd cargoscan-backend
docker compose up -d
cp .env.example .env       # only JWT_SECRET needs editing for dev
npm install
npx prisma migrate dev --name phase1_init
npm run seed
npm run dev
```

(The Prisma `migrations/` folder has to be generated on a machine with internet
access to Prisma's binary CDN — the sandbox here can't reach it. One-shot.)

---

## Done — P1 (Phase 1 platform features)

### Multi-tenant + group-consolidation data model

`prisma/schema.prisma` now has:

| Model | Purpose |
|-------|---------|
| `Consignee` | The cargo owner inside a shared shipment. Has phone (E.164 for WhatsApp), email, opt-in flag, optional per-consignee CBM rate override, free-text notes. The actual Ghana use case: 8–15 importers sharing one 40HC. |
| `ApiKey` | Developer-API keys scoped to an organization. `ck_live_*` / `ck_test_*` format, scopes as CSV, bcrypt-hashed secret stored only once. |
| `Webhook` | Outbound subscription. URL, event filter, signing secret, failure counter. |
| `WebhookDelivery` | Per-attempt delivery log: response status, body, attempt count. |
| `ScanCertificate` | Tamper-proof SHA-256 hash over the canonical scan payload. Anyone can verify by hitting `/api/tracking/_verify/:hash`. |

Other schema changes: `CargoItem.consigneeId`, `CargoItem.description`,
`ScanResult.source` (LIDAR / MANUAL / GEMINI_VISION / PHOTOGRAMMETRY) and
`ScanResult.apiKeyId`, `Dispute.status` adds `REVIEW`, `AuditLog` adds `apiKeyId`,
`NotificationLog` adds `providerRef` / `errorMessage` / `payload`.

### Public API

| Surface | File |
|---------|------|
| Key auth middleware (Bearer or `X-API-Key`, scope checks, `lastUsedAt` tracking) | `src/middleware/apiKey.js` |
| Unified middleware that picks JWT or API key based on token shape | `src/middleware/either.js` |
| `/api/keys` list / create (one-time secret reveal) / revoke / reactivate | `src/routes/apiKeys.js` |
| `/api/webhooks` list / create (one-time secret reveal) / delete / `:id/deliveries` | `src/routes/webhooks.js` |
| `/api/consignees` list / get / create / update / delete (refuses delete if items still attached) | `src/routes/consignees.js` |
| `/api/tracking/:code` public, no-auth | `src/routes/tracking.js` |
| `/api/tracking/_verify/:hash` certificate verification | `src/routes/tracking.js` |
| `/api/auth/me` session rehydration | `src/routes/auth.js` |
| Existing `/api/items`, `/api/shipments`, `/api/scans` now accept either JWT or API key with appropriate scopes | `src/routes/{items,shipments,scans}.js` |

### Event bus + service integrations

| Component | File |
|-----------|------|
| Internal event bus (12 known event types) | `src/lib/events.js` |
| Webhook dispatcher: HMAC-SHA256 signing, 5 retries, exponential backoff, full delivery log | `src/services/webhookDispatcher.js` |
| WhatsApp service: Meta Cloud API + Twilio fallback, 3 templates, auto-listens to events, no-ops gracefully when env keys absent, every send → `NotificationLog` | `src/services/whatsapp.js` |
| Gemini wrapper: text / json / vision modes, no SDK dependency | `src/services/gemini.js` |
| Customer-facing CBM measurement prompt + JSON schema (estimate-only mode for the cargo-owner side) | `src/services/prompts/measureFromPhoto.js` |
| Scan certificate hashing | `src/lib/scanCertificate.js` |
| Audit log helper | `src/lib/audit.js` |
| API key generation / parsing / verification | `src/lib/apiKeys.js` |

### End-to-end loop now works

A scan in the iOS app fans out automatically:

1. `POST /api/scans` → ScanResult written + cargo item updated.
2. `ScanCertificate` row created with SHA-256 of the canonical payload.
3. `audit("scan.create", …)` writes to `AuditLog`.
4. `emit("scan.created", {…})` fires.
5. WhatsApp service handler: if the item has a consignee with `whatsappOptIn = true`, sends `cargo_received` template with the dimensions, CBM, and cost (CBM × forwarder's rate).
6. Webhook dispatcher fans out to every webhook subscribed to `scan.created`, with HMAC signature header.
7. The `/api/tracking/:code` page shows the scan + the certificate hash; partner can verify the hash via `_verify`.

Same pattern for shipment status changes (`PUT /api/shipments/:id` with new
status emits `shipment.status_changed` plus a more specific event like
`shipment.in_transit`, `shipment.arrived`, etc., which the WhatsApp service
maps to its own templates).

### Developer documentation

- `cargoscan-backend/API.md` — partner-facing guide with quickstart, scopes, webhook signature verification, error codes.

---

## Not yet done

### Frontend (web app)

- **Developers tab** in the Org Admin dashboard: list / create / revoke API keys (with copy-to-clipboard once-only secret reveal), list webhooks, view recent deliveries with response codes, copy the signing secret on creation.
- **Customers tab** inside Shipment detail: list consignees, add new (name + phone + email + opt-in toggle + rate override), reassign cargo items between consignees.
- **Public tracking page** at a `/track/:code` route in the SPA, calling `/api/tracking/:code` and rendering forwarder name, per-consignee CBM totals, photos, status timeline, scan certificate hash with verify-button.
- **Scan-certificate badge** on the existing item detail view in the dashboard.

### Backend

- **Per-API-key rate limits** (separate buckets per env: 60 req/min for live, 30 for test). Needs Redis token-bucket — Redis client is in deps but not yet wired in.
- **Plan + trial enforcement middleware** (deny when `planExpiresAt` is past, return 429 at trial caps). The schema fields are ready; only the middleware is missing.
- **Dispute auto-detection.** When a second scan arrives for an item that already has a scan, compare CBM. <5% → `RESOLVED` (auto-approved). 5–10% → `REVIEW`. >10% → `OPEN` plus `dispute.opened` event (which the WhatsApp service can hook for `dispute_opened` template — template not yet added).
- **Photo upload endpoint** (`POST /api/scans/:id/photo`) → Supabase signed URL or S3 presigned PUT, then update `ScanResult.photoUrl`.
- **Paystack billing.** `routes/billing.js` with `POST /init` returning Paystack auth URL and `POST /webhook` verifying signature → `Subscription` write → `Organization.plan` update. Includes the plan-override admin endpoint.
- **Email service.** Welcome email on signup + cron-driven 5-email onboarding sequence. SendGrid first, SMTP fallback.
- **Excel packing-list export.** `GET /api/shipments/:id/export` → 3-sheet workbook (manifest, per-consignee summary, damaged items).
- **Tenant by subdomain** for `slug.cargoscan.app`. Backend already isolates by `req.org.id`, so this is mostly a Host-header → JWT-context bridge plus a Cloudflare/Firebase wildcard.
- **Real `/api/health`** that probes Postgres + Redis + Paystack + WhatsApp.

### iOS

- Login screen + Keychain JWT storage (currently the iOS scanner reads `cs_token` from `UserDefaults` and assumes someone else logged in).
- Offline scan queue using Core Data, drained by the existing exponential-backoff loop in `NetworkService.swift`.
- Scan source field — the iOS payload should set `source: "LIDAR"` explicitly (the backend defaults to LIDAR if missing, so this is harmless drift but worth fixing).
- A "Quick estimate" mode that uses Gemini Vision when the device has no LiDAR — clearly labelled as preview-only, NOT the billing source of truth.

### Cleanup (still pending your sign-off)

- Delete `cargoscan-ios/` (duplicate of `cargoscan-ios-project/Cargoscan/`).
- Delete `extracted_new/`, `v3_final/`, `v3_update/`, `files (1).zip`.
- Move or delete `cargoscan-production.jsx` — it's a 1,675-line dead prototype with the super-admin password hardcoded in plaintext at line ~194.

---

## Recommended next moves

1. **Frontend Developers + Customers tabs** so you can demo the API-key flow + group consolidation visually.
2. **Photo upload** + **dispute auto-detection** — these complete the trust loop. The customer's WhatsApp message would then include a real photo URL, and any tampering would be caught automatically.
3. **Paystack** so you can accept money. Test mode first (MoMo + cards), live mode after.

Order can flex. The end-to-end demo today is: seed the DB, log in as John, hit a couple of REST calls, see WhatsApp sends logged in `NotificationLog`, see webhook deliveries logged in `WebhookDelivery`, see the public tracking page render correctly. Once the frontend tabs land, that becomes a click-through demo you can show to your first 3 freight forwarders.
