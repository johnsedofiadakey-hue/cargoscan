# CargoScan — Gap Analysis & Path to Working MVP

Repo: https://github.com/johnsedofiadakey-hue/cargoscan
Reviewed: 2026-05-10
Source of truth for "intent": `CARGOSCAN-COMPLETE-README.md` (the 1,000+ line spec at the repo root).

---

## 1. Project intent (what the README sells)

CargoScan is pitched as a **production-ready, multi-tenant SaaS for precision freight measurement on the China–Ghana corridor**. The README promises a complete platform with:

- **iOS LiDAR scanner** (ARKit, 30k depth points/sec, ±0.5–1.5cm accuracy, confidence scoring, auto-lock at 97%)
- **Web app** with role-based dashboards (Super Admin, Admin, Supervisor, Operator) on a **single login URL** with silent role routing
- **Multi-tenant backend** (one PostgreSQL, per-org subdomain `slug.cargoscan.app`, isolated data, plan-aware rate limits)
- **Self-serve org signup** that provisions org + admin user + default warehouse + JWT + welcome email + 5-email onboarding sequence in one transaction
- **Trial system** (TRIAL/STARTER/BUSINESS/ENTERPRISE) with hard usage limits enforced server-side, returning `429` when exceeded
- **Paystack billing** (Ghana mobile money + cards) with webhooks, plan codes, test/live toggle, and a Super Admin "plan override" bypass
- **WhatsApp notifications** via Meta Cloud API (with Twilio fallback) for cargo received, damage, departure, port arrival, and dispute events — with 5 pre-approved templates
- **Disputes engine** that auto-compares origin vs destination scans (auto-approve <5% diff, review queue 5–10%, auto-open >10%)
- **Public tracking portal** at `track.cargoscan.app/{code}` with company branding
- **Excel packing-list export** (3-sheet workbook), photo storage on Supabase / S3, Redis-backed rate limiting and refresh tokens, audit log of every API call, offline scan queue with sync, maintenance mode toggle, system-health dashboard, etc.

Tech stack named: React (Vite) frontend, Node + Express + Prisma + PostgreSQL backend, Redis, SwiftUI + ARKit iOS, Paystack + Stripe, Meta WhatsApp + Twilio, SendGrid/Nodemailer, Supabase Storage / AWS S3, deploy on Railway + Vercel.

---

## 2. What actually exists in the repo

```
cargoscan/
├── CARGOSCAN-COMPLETE-README.md      ← the 43KB spec
├── cargoscan-production.jsx          ← 1,675-line single-file React prototype (no API calls)
├── cargoscan-app/                    ← Vite + React 19 web app (THE real frontend; 2,176-line App.jsx)
├── cargoscan-backend/                ← Node + Express + Prisma backend (8 source files)
├── cargoscan-ios/                    ← Loose Swift files (LiDAR engine + scanner UI)
├── cargoscan-ios-project/            ← Actual Xcode project that wraps the same Swift files + adds HomeView + NetworkService
├── extracted_new/, v3_final/, v3_update/   ← Older snapshots / zip dumps of the iOS code
├── files (1).zip                     ← 282KB stale zip
├── firebase.json, .firebaserc        ← Firebase Hosting config (project: cargoscan-app-2026)
└── .firebase/                        ← Firebase deploy cache
```

**Working observations:**
- Backend syntax-checks clean (`node --check` passes on every file).
- Frontend `npm install` + `vite build` succeeds — produces a 286KB JS bundle (only two duplicate-key CSS warnings; cosmetic).
- The Swift measurement engine is **real, non-trivial code** (~3,100 LOC across `MeasurementEngine.swift`, `ARScannerViewModel.swift`, `EdgeDetector.swift`, `ScannerView.swift`) implementing a 14-step LiDAR pipeline (ARKit depth → RANSAC plane fit → convex hull → rotating calipers → IQR outlier rejection). This is the most production-shaped piece of the project.
- The web app's login + signup screens **do** call the backend (`/api/auth/login`, `/api/auth/signup`).
- The backend implements working CRUD for shipments, items, scans, disputes, and lists organizations for super-admin.

---

## 3. Intent vs. implementation — the gap matrix

Status legend: ✅ exists & working · ⚠️ partial · ❌ missing · 🐛 buggy

| Capability promised in README | Status | Where it lives / what's missing |
|---|---|---|
| Single login screen with silent role routing | ✅ | `cargoscan-app/src/App.jsx` LoginScreen → `/api/auth/login`. Backend routes by role. |
| Self-serve org signup creating org + admin + warehouse in one tx | ✅ | `cargoscan-backend/src/routes/auth.js` (clean Prisma `$transaction`) |
| Per-org subdomain (`slug.cargoscan.app`) tenant resolution | ❌ | No `tenant.js` middleware. Tenant is read from JWT only; no Host-header parsing. Subdomains aren't wired into Firebase Hosting either. |
| Multi-tenant data isolation in queries | ✅ | Every route filters by `req.org.id`. Verified in items, shipments, scans, disputes. |
| Plan-aware rate limiting / 429 when at trial limits | ❌ | `express-rate-limit` is a flat 100 req/15 min for everyone. No code reads `org.plan` to enforce per-plan caps on shipments / items / users / WhatsApp. |
| Trial 14-day countdown + paywall when expired | ❌ | `planExpiresAt` is set on signup but **never checked anywhere**. Expired trials still get full access. |
| Super Admin console (9 tabs: orgs, flags, pricing, paystack, override, health, whatsapp test, audit) | ⚠️ | UI tabs exist in `App.jsx` / `cargoscan-production.jsx`. Backend only has `/api/admin/organizations` and `/api/admin/subscriptions` — **no flags, pricing, override, health, audit, or WhatsApp-test endpoints**. |
| Super Admin auth | 🐛 | `auth.js` issues a `SUPER_ADMIN` JWT with **no `id` field**. `middleware/auth.js` then does `prisma.user.findUnique({ where:{ id: decoded.id } })` which yields `null`, returning 403. So a logged-in super admin **cannot call any authenticated route**. The admin route only works via the alternative `x-admin-key` header path. |
| Org ADMIN / SUPERVISOR / OPERATOR permission matrix | ⚠️ | `requireRole` exists and is applied to shipments POST/PUT, but **not** to disputes (anyone can create/list), items (operator can edit), or scans. Permissions table in README isn't fully enforced. |
| Team management & invites (admin creates worker accounts) | ❌ | No `/api/users` or `/api/teams` route. README's "+ Invite Team Member" flow has no backend. |
| Paystack billing (checkout + webhook + plan codes + override) | ❌ | Zero Paystack code. No `/api/billing` route. `Subscription` table exists but is never written to. No webhook handler. |
| Stripe billing | ❌ | Not implemented. |
| WhatsApp notifications (5 templates, Meta API) | ❌ | Zero WhatsApp code. `NotificationLog` model exists but is never written to. No template files, no token check. |
| Twilio fallback | ❌ | Not implemented. |
| Email (welcome + 5-email onboarding sequence) | ❌ | No `nodemailer` / `sendgrid` import anywhere. |
| Photo storage (Supabase / S3) | ❌ | `ScanResult.photoUrl` is a free-form string; no upload endpoint, no bucket integration. |
| Public tracking portal (`track.cargoscan.app/{code}`) | ❌ | No public route. No frontend page. |
| Excel packing-list export (3-sheet) | ❌ | No `xlsx` / `exceljs` dependency. No export route. |
| Dispute auto-detection (origin vs destination, 5/10% thresholds) | ❌ | `disputes.js` only persists what the client posts. No comparison logic, no auto-open, no auto-approve. |
| Offline scan queue / sync | ⚠️ | `SyncQueue` model exists. No endpoint reads/writes it. iOS has no offline persistence. |
| Audit log on every action | ⚠️ | `AuditLog` model exists. Nothing writes to it. |
| Maintenance mode + feature flags | ❌ | Flags live only in frontend state. Backend never reads them; no FeatureFlag model. |
| System health dashboard (DB / Redis / Paystack / WhatsApp / SMTP / Storage status) | ❌ | `/api/health` returns a static `{status:"ok"}`. No real probes. |
| Redis (rate-limit + refresh tokens) | ❌ | `redis` is in `package.json` but never `require`d. JWTs are 30-day single-token (no refresh flow). |
| Refresh tokens | ❌ | Only one long-lived access token. README says 15-min access + 30-day refresh. |
| Password reset / email verification | ❌ | "Forgot password?" link in UI is a no-op. |
| Prisma migrations | ❌ | `cargoscan-backend/prisma/` has only `schema.prisma`. No `migrations/` folder. README's `npx prisma migrate dev --name init` has never been committed. |
| Seed script (`node prisma/seed.js`) | ❌ | File doesn't exist. README's demo accounts can't be created without it. |
| Docker compose for Postgres + Redis | ❌ | No `docker-compose.yml`. README references one. |
| `.env.example` covering all README env vars (Paystack, WhatsApp, Twilio, Supabase, SendGrid…) | ❌ | The committed example only has `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `VITE_API_URL`. README Section 14 lists ~25 vars. |
| iOS LiDAR measurement engine | ✅ | Real implementation in `MeasurementEngine.swift` + `EdgeDetector.swift`. |
| iOS uploads scan to backend | ⚠️ | `NetworkService.swift` posts to `/api/scans` but **never logs in / never sets `cs_token`** — there's no login screen on iOS. Without a token, the backend rejects with 401. Also requires a `cargoItemId` that has to be created on the web first. |
| iOS Xcode project actually buildable | ⚠️ | `Cargoscan.xcodeproj` is committed; bundle id, signing team and `Cargoscan.entitlements` need to be set. Cannot verify without macOS. |
| `package.json` `description`, `keywords`, `author`, `license` filled | ❌ | All blank. Test script exits 1. |
| sqlite3 dependency | 🐛 | Listed in backend deps but unused (schema is Postgres). Forces a `node-gyp` native build that fails in offline environments. Should be removed. |
| Two Firebase Hosting configs (root + `cargoscan-app/`) | 🐛 | Conflicting `firebase.json` files with different `public:` paths. The root one points at `cargoscan-app/dist`, the inner one at `dist`. Pick one — the inner one will win when running `firebase deploy` from `cargoscan-app/`. |
| Two parallel React codebases (`App.jsx` + `cargoscan-production.jsx`) | 🐛 | Both ~2K-line single files with overlapping copy. `cargoscan-production.jsx` has **no API calls** and isn't imported anywhere in the build — it's a dead, in-memory prototype. Either delete it or fold its UI into `App.jsx`. |
| Two parallel iOS sources (`cargoscan-ios/` vs `cargoscan-ios-project/Cargoscan/`) | 🐛 | Same Swift files duplicated. The Xcode project only references the inner folder. The outer one drifts and should be removed. |

**Summary, scored:** roughly **35% of what the README promises is actually implemented**, almost entirely on the read/write CRUD path and the iOS measurement engine. The entire monetisation path (billing, plans, limits, trial enforcement), the entire customer-comms path (WhatsApp, email, tracking portal), and the entire devops path (migrations, seed, Redis, audit, health) are missing.

---

## 4. Severity-ranked gap list (what to fix, in order)

### P0 — Project will not run end-to-end without these

1. **Add Prisma migrations and a seed script.** Run `npx prisma migrate dev --name init` once and commit `prisma/migrations/`. Write `prisma/seed.js` that creates the README's five demo accounts (Stormglide / FastFreight / Wei) so a fresh checkout boots with usable data.
2. **Fix Super Admin JWT.** Either (a) put a real `SUPER_ADMIN` user row in the DB and use the same `id`-based middleware, or (b) make the middleware short-circuit when `decoded.role === "SUPER_ADMIN"` without hitting Prisma. Today the super admin flow is broken on every authenticated route.
3. **Drop `sqlite3` from `package.json` dependencies.** It's unused and breaks `npm install` in any sandbox without internet access to nodejs.org headers.
4. **Resolve the dual-frontend confusion.** Decide whether `cargoscan-production.jsx` is the canonical UI (then wire it into `main.jsx` and add the API calls that App.jsx has), or whether `cargoscan-app/src/App.jsx` is canonical (then delete the loose JSX). Pick one.
5. **Write a real `.env.example`.** Cover every variable the README mentions (JWT_SECRET, PAYSTACK_*, WHATSAPP_*, TWILIO_*, SUPABASE_*, SENDGRID_*, FRONTEND_URL, SUPER_ADMIN_KEY, etc.) so a new dev can fill in blanks instead of grepping the README.
6. **Add a `docker-compose.yml`** with Postgres 14 + Redis 7. The README's local-dev instructions assume one exists.

### P1 — Product is still a demo until these land

7. **Plan + trial enforcement middleware.** Read `org.plan` and `org.planExpiresAt` on every authenticated request. Block writes when expired. Enforce per-plan caps on shipments/items/users with a real `429` and an `X-Plan-Limit` header.
8. **Paystack integration.** `routes/billing.js` with `POST /init` (returns Paystack auth URL) and `POST /webhook` (verifies signature, updates `Subscription` and `Organization.plan`). Three plan codes from `.env`. Plan-override admin endpoint that writes an `AuditLog`.
9. **WhatsApp service.** `services/whatsapp.js` wrapping Meta Cloud API. Five template senders (`cargoReceived`, `damageDetected`, `shipmentDeparted`, `portArrival`, `disputeOpened`). Hooked into the scan, item-update, shipment-status, and dispute-create routes. Always writes a `NotificationLog`.
10. **Email service.** Nodemailer with SMTP creds from `.env`. Welcome email on signup + cron-driven 5-email onboarding sequence. (Or use a managed sender like SendGrid/Resend.)
11. **Photo upload endpoint.** `POST /api/scans/:id/photo` → presigned Supabase or S3 URL. Update `ScanResult.photoUrl`.
12. **Dispute auto-detection.** When a second scan arrives for an item that already has a scan, compare CBM. <5% → auto-approve. 5–10% → open dispute, status `REVIEW`. >10% → open dispute, status `OPEN`, fire WhatsApp `disputeOpened`.
13. **Team management endpoints.** `POST /api/users` (admin only) creates a worker with a generated temp password (returned once, never stored in cleartext). `GET /api/users` lists, `PATCH` toggles `active`. Wire into the Team tab.
14. **Audit log writer.** Tiny `audit(orgId, userId, action, details)` helper called from every mutating route. The Super Admin "Audit Logs" tab finally has data.

### P2 — Polish needed before production

15. **Refresh tokens** (15-min access + 30-day refresh) backed by Redis. Today's 30-day single token is a security smell.
16. **Real `/api/health`** that probes Postgres (`SELECT 1`), Redis (`PING`), Paystack (`/transaction/totals`), and WhatsApp (token introspection). Surface in Super Admin → System Health.
17. **Public tracking portal.** A no-auth `/api/tracking/:code` returning sanitised shipment/item info, plus a simple `track.cargoscan.app/:code` page in the web app.
18. **Excel export.** `npm i exceljs` and a `GET /api/shipments/:id/export` returning a 3-sheet workbook (manifest, customer summary, damaged items) per the README.
19. **Tenant-by-subdomain middleware.** If you genuinely want `slug.cargoscan.app`, wire Firebase Hosting (or Cloudflare) wildcard subdomain → `*.cargoscan.app` → SPA, and have the SPA pass the slug through; the backend already filters by `req.org.id` so there's only a thin client-side change to make.
20. **Feature flags table.** Move the in-memory `flags` object out of the frontend into a `FeatureFlag` Prisma model so toggles in Super Admin actually do something.
21. **Maintenance mode.** Single boolean in feature flags + middleware that returns a 503 with HTML page to anyone except super admin.
22. **iOS auth UX.** Add a login screen to the iOS app that hits `/api/auth/login` and stores the JWT in Keychain (not `UserDefaults`). Provide a way to pick the active shipment so `cargoItemId` is created server-side, not typed by hand.
23. **iOS offline queue.** Use Core Data or a JSON file in the app's documents directory to queue scans when offline, retried with the existing exponential-backoff loop in `NetworkService.swift`.
24. **Tests.** Add Jest/Vitest for backend routes, Vitest + React Testing Library for the web, XCTest for the Swift measurement engine. Today every test script just exits.

### P3 — Cleanup that pays for itself

25. Delete `extracted_new/`, `v3_final/`, `v3_update/`, `files (1).zip`, `cargoscan-ios/` (duplicate of `cargoscan-ios-project/Cargoscan/`), and one of the two `firebase.json`s.
26. Move secrets out of `cargoscan-production.jsx` (line ≈ 194: `_sa: { email:"admin@cargoscan.app", pass:"Cs#Platform2026!" }`). Even as a dev placeholder, that string should not be in any client bundle.
27. Fix the two duplicate-`minHeight` warnings in `App.jsx` (lines 522 and 726). Cosmetic but easy.
28. Fill in `package.json` `description`, `author`, `license`. Replace the `test` script with something real.

---

## 5. A concrete plan to "make this work"

A pragmatic 4-phase track. Each phase ends with something the founder (or a customer) can demo.

### Phase 0 — Make the dev loop boot (1–2 days)
- Prisma migrations + seed.
- Drop sqlite3, fix dependencies.
- `docker-compose.yml` with Postgres 14 + Redis 7.
- Write `.env.example` covering every variable referenced anywhere.
- Fix the super admin JWT bug.
- Resolve dual frontend / dual iOS folder.
- **Acceptance:** `git clone && docker compose up -d && npm i && npx prisma migrate dev && node prisma/seed.js && npm run dev` produces a working API; demo accounts log in; you can post a scan via curl with John's token.

### Phase 1 — Trial-grade SaaS (1–2 weeks)
- Plan/trial middleware (deny when expired, return 429 at limits).
- Team-management endpoints + Team tab wired in.
- Audit log writer + Super Admin Audit tab.
- Dispute auto-detection.
- Photo upload to Supabase Storage.
- Tests for the trial middleware and dispute logic.
- **Acceptance:** A new org can sign up, hit a trial cap and see the upgrade prompt; an operator scan produces an audit row and a dispute when CBM differs by ≥5%.

### Phase 2 — Money + comms (1–2 weeks)
- Paystack init + webhook + plan codes (test mode).
- Subscription writes + plan override endpoint.
- Email welcome + onboarding via SendGrid/Resend.
- WhatsApp service with the 5 Meta templates (sandbox first, real templates after Meta approval).
- Excel packing-list export.
- **Acceptance:** Pay with a Paystack test card, webhook flips org plan, John gets a welcome email and a `cargo_received` WhatsApp on his next scan.

### Phase 3 — Production hardening (1 week)
- Refresh tokens.
- Real health endpoint.
- Public tracking portal.
- Tenant-by-subdomain wildcard.
- iOS login + Keychain + offline queue.
- Maintenance mode + feature-flag table.
- Push to Railway (API), Vercel or Firebase Hosting (web), TestFlight (iOS).
- **Acceptance:** A customer can scan an iPhone box at origin, see it on `track.cargoscan.app/SHP-…`, get a WhatsApp at port arrival, and Stormglide pays Paystack monthly.

---

## 6. Concrete files to add (suggested layout)

```
cargoscan-backend/
├── docker-compose.yml                      ← NEW
├── prisma/
│   ├── migrations/.../migration.sql        ← NEW (run prisma migrate dev once)
│   └── seed.js                             ← NEW
├── src/
│   ├── middleware/
│   │   ├── plan.js                         ← NEW (trial expiry + limits)
│   │   └── tenant.js                       ← NEW (Host-based org resolution, optional)
│   ├── services/
│   │   ├── paystack.js                     ← NEW
│   │   ├── whatsapp.js                     ← NEW
│   │   ├── email.js                        ← NEW
│   │   └── storage.js                      ← NEW (Supabase signed URLs)
│   ├── routes/
│   │   ├── billing.js                      ← NEW
│   │   ├── users.js                        ← NEW (team mgmt)
│   │   ├── tracking.js                     ← NEW (public, no auth)
│   │   ├── exports.js                      ← NEW (Excel)
│   │   └── flags.js                        ← NEW (super admin only)
│   └── lib/
│       └── audit.js                        ← NEW
└── tests/                                  ← NEW (Jest/Vitest)
```

This gap analysis is the working document. Each P0–P3 item maps to one PR; ship them in order and the README becomes literally true.
