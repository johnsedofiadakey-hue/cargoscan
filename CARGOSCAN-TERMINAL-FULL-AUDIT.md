# CargoScan Terminal Full Audit

Date: 2026-05-17  
Repo: `/Users/truth/cargoscan`

## Executive Summary

CargoScan is a feasible freight-forwarding warehouse platform, but the current codebase is pilot-stage rather than production-ready. The system has the right broad components: a React/Vite dashboard, Express/Prisma API, Postgres schema, Redis-backed sessions/rate limiting, Firebase Google sign-in, Paystack billing hooks, WhatsApp/email notification services, public tracking, containers, API keys/webhooks, and an iOS ARKit/LiDAR scanner.

The largest product gap is operational: the database and UI are still centered on already-scanned cargo items. A realistic warehouse needs a package-first workflow where packages can exist before dimensions are known, then move through `WAITING_FOR_SCAN`, `SCANNING`, `READY_TO_LOAD`, `NEEDS_REVIEW`, `RESCAN_REQUIRED`, `LOADED`, and `DELIVERED`. Today `CargoItem` requires dimensions and defaults to `SCANNED`, so placeholders are faked with `1 x 1 x 1 cm` from iOS. That leaks into CBM, queues, dashboards, and billing.

Backend coverage is broad but shallow. Most core routes exist, tenant filtering is usually applied, and tests pass, but validation is inconsistent, route contracts drift from docs, role/scope enforcement is uneven, photo upload is unsafe for production when local storage is used, refresh/session handling is single-device only, public tracking exposes shipment/item data by guessable codes or UUIDs, and migrations/deployment contain risky history workarounds.

The dashboard is useful as a pilot admin console but not yet a warehouse command center. It has real API integration for shipments, items, consignees, containers, team, billing, mobile install, and public tracking, but it lacks scan assignment, review queues, exception handling, package labels/barcodes, container overfill prevention, search/filtering, true mobile app distribution, API-key/webhook UI, and durable session refresh.

The iOS app is the most technically ambitious part. It contains a real ARKit scene-depth and mesh-based measurement pipeline with object guidance, photo capture, backend scan save, AI quality check call, and offline queue code. It still needs real-device validation, signing/TestFlight setup, lifecycle-driven offline retry, device capability gating, better quick-scan behavior, customer/package assignment, and accuracy testing against physical cargo.

Feasibility judgment: feasible for a private pilot after workflow and storage hardening. Not ready for public SaaS or production billing/compliance.

## Current System Map

- Web app: `cargoscan-app`, React 19, Vite 7, Firebase client auth, single main `App.jsx` dashboard plus `TrackingPage.jsx`.
- Backend: `cargoscan-backend`, Express 5, Prisma 6, Postgres, Redis via `ioredis`, JWT auth, Firebase Admin token verification, Paystack webhook, SendGrid/email templates, WhatsApp service, API keys, webhooks, scan quality service.
- Database: Prisma models for organizations, users, warehouses, shipments, consignees, cargo items, scan results, scan certificates, disputes, subscriptions, audit logs, notification logs, API keys, webhooks, containers, and sync queue.
- iOS app: SwiftUI + ARKit + RealityKit app with login, shipment/item selection, AR scanner, measurement engine, edge detector, photo upload, quality-check request, and offline scan queue.
- Deployment: `render.yaml` provisions Render web service, free Postgres, free key-value Redis, env vars, `/api/health`; `firebase.json` hosts `cargoscan-app/dist`.

## Intended Product and Users

CargoScan is trying to serve freight-forwarding warehouse operators and managers.

- Admins create organizations, shipments, customers/consignees, users, containers, billing, API keys, and webhooks.
- Supervisors manage day-to-day warehouse flow, package review, and container loading.
- Operators use an iPhone Pro/LiDAR app to scan cargo packages and capture dimensions/photos.
- Customers/consignees receive tracking links and notification updates.
- External systems can integrate through API keys and webhooks.

The intended operational flow should be:

1. Admin opens a shipment or receiving batch.
2. Admin/supervisor imports or creates package placeholders, each tied to a customer/consignee.
3. Operator selects or scans a package label on iPhone.
4. iPhone captures LiDAR dimensions, evidence photo, quality metrics, and optional AI review.
5. Backend stores scan result, updates package state, emits audit/webhook/notification events.
6. Supervisor reviews exceptions and approves/rescans questionable packages.
7. Loader assigns ready packages to a container while watching CBM utilization and destination mix.
8. Shipment/container moves through sealed, in transit, arrived, delivered.
9. Customer tracking page reflects item/shipment status and evidence at an appropriate privacy level.

## Full Feature List

- Email/password signup and login.
- Google sign-in through Firebase ID token verification.
- JWT access tokens and Redis-stored refresh tokens.
- Organization/tenant model with plans.
- Role model: `ADMIN`, `SUPERVISOR`, `OPERATOR`, plus platform `SUPER_ADMIN`.
- Shipment CRUD-lite: list, create, update status.
- Consignee CRUD.
- Cargo item list/create/get/update.
- Scan create/list/photo upload URL/update.
- Local and Supabase-like storage abstraction.
- Scan quality endpoint with local gates plus optional OpenAI call.
- Scan certificate hash verification.
- Container create/list/update/load/unload/tracking placeholder.
- Public item/shipment tracking.
- Team create/list/update/reset password.
- Paystack checkout initialization and webhook processing.
- API key create/list/delete and API-key auth.
- Webhook create/list/delete/deliveries and dispatcher.
- Audit logs and admin organization/subscription views.
- WhatsApp and email notification services.
- Redis-backed API-key rate limiter.
- Health check covering database and Redis.
- iOS login, token refresh, shipment and item load, linked scan save, AR/LiDAR measurement, photo upload, quality check, offline queue.

## Current Working Features

- Frontend production build passes.
- Frontend lint passes.
- Backend Prisma client generation passes.
- Backend contract tests pass: 4/4.
- Core dashboard can call real API routes for auth, shipments, items, consignees, containers, users, billing, and tracking.
- Backend tenant filtering is present on most data routes through `req.org`.
- Firebase sign-in backend route exists and creates or logs in users.
- Paystack webhook signature verification uses HMAC SHA512.
- Container utilization is calculated from loaded item CBM.
- iOS has real ARKit depth/mesh measurement code, not hardcoded dimensions.

## Broken or Incomplete Features

- Package placeholders are not first-class. `CargoItem.length`, `width`, `height`, `cbm`, and `scanConfidence` are required, and status defaults to `SCANNED`.
- iOS creates package placeholders with `1 x 1 x 1 cm`, which pollutes CBM and status until scanned.
- There is no explicit `WAITING_FOR_SCAN`, `SCANNING`, `READY_TO_LOAD`, `NEEDS_REVIEW`, or `RESCAN_REQUIRED` model.
- Dashboard "Waiting for container assignment" includes unscanned or questionable items because it only checks `!containerId`.
- Quick Test Scan on iOS has no backend save path because `cargoItemId` is nil.
- Offline queue is not triggered from app startup/foreground/network restoration.
- Photo storage defaults to local disk in Render config, which is ephemeral and not production-safe.
- Public tracking has no dedicated tracking token, customer auth, masking, or privacy boundary.
- API key and webhook backend exists, but the dashboard has no Developers UI.
- Refresh tokens are stored in web localStorage but never used by the web API helper.
- Super-admin billing override route is unreachable through normal `authenticateToken`/`requireRole(["SUPER_ADMIN"])` expectations unless a super-admin JWT is used; admin-key middleware is not used there.
- Container loading does not prevent overfill, mixed-destination mistakes, loading unreviewed scans, or loading into sealed containers.
- Shipment status updates do not cascade package/container state.
- Live container tracking is a placeholder.
- Paystack billing initializes one-off transactions, not a complete recurring subscription lifecycle.

## Bugs Found

- `CargoItem` default status is `SCANNED`, so new dashboard-created items appear scanned even before an iPhone scan exists.
- iOS `createCargoItem` sends dimensions `1,1,1`, creating fake `0.000001 CBM` inventory.
- `scanSchema` does not include `source`; `req.body.source` is read anyway. This currently works because Zod strips unknown keys from parsed data but the raw body is still used, which is confusing and untested.
- `router.put("/upload-local")` is declared after `router.patch("/:scanResultId")`; method differs so it currently works, but the unauthenticated local upload URL accepts arbitrary writes under `uploads` by possession of the URL.
- `quality-check` uses `err.errors` for Zod v4, but Zod v4 exposes issues via `.issues`; error responses may omit details.
- Billing webhook failure branch uses `org.plan` inside `if (org && org.users.length > 0)` then creates a subscription after that block. If `orgId` exists but the organization lookup fails, `org.plan` can throw.
- Webhook docs say `x-cargoscan-signature` over raw payload only, but dispatcher sends `X-CargoScan-Signature: t=<ts>,v1=<sig>` over `timestamp.body`.
- API docs for `POST /scans` show `shipmentId`/`consigneeId`, but implementation requires `cargoItemId`.
- `ApiKey.rateLimit` is referenced in middleware but no `rateLimit` field exists in Prisma schema.
- `verifyTenant` middleware exists but is not mounted, so `x-organization-slug` tenant checks are documented by code but unused.
- `NotificationLog` has no `organizationId`, weakening tenant-level notification auditability.
- Multiple modules instantiate separate `PrismaClient`s, which can exhaust database connections under load.

## Security Risks

- Web access and refresh tokens are stored in localStorage, increasing XSS blast radius.
- Signup/login lack explicit request schema validation, password policy, email verification, account lockout, and login-specific rate limit.
- Public tracking by shipment code or item UUID can leak package metadata if links are guessed or shared.
- Local upload endpoint is unauthenticated once a presigned URL is issued; local disk storage on a public API service is not suitable.
- Webhook URLs are not validated for SSRF risks, private IPs, or allowed schemes.
- API key scopes are arbitrary CSV strings with no schema/allowed-scope validation.
- Role strings are not enum-constrained; invalid roles can be created by admin user route.
- CORS allows `*.cargoscan.app`, which is reasonable for SaaS subdomains but dangerous if any subdomain can be user-controlled.
- Super admin login relies on env password hash and JWT; no MFA, IP allowlist, or audit-specific hardening.
- Paystack route does not guard against missing secret before calling Paystack.
- AI quality endpoint accepts base64 images; no payload size limit beyond global `express.json()` default behavior.

## Production Risks

- Render free plan plus free Postgres/Redis is not suitable for production warehouse operations.
- `STORAGE_PROVIDER=local` in `render.yaml` means uploaded photos can disappear on redeploy/restart.
- `render.yaml` build command includes `prisma migrate resolve --rolled-back 20260511000001_production_hardening || true`, which is a risky migration-history workaround.
- No database backup/restore automation is wired into deployment.
- No structured logging, metrics, alerting, SLOs, or error tracking.
- Health check returns 503 if Redis is down, but auth and rate limiting depend on Redis heavily.
- Scheduler sends expiring-trial emails hourly without a sent flag, which can spam.
- Webhook dispatcher retries in-process only; retries are lost on process crash.
- Background notification/webhook jobs run inside the API process, not a durable queue.
- No CI configuration was found for builds/tests/security checks.
- No migration tests or seeded integration tests cover the main warehouse flow.

## UI/UX Problems

- The dashboard looks polished, but it reads more like a SaaS demo than a dense warehouse command center.
- The first operational tab mixes shipment creation, package creation, scan saving, shipment list, and cargo cards in one view.
- Package queue is based on container assignment, not true scan/load readiness.
- No package label/barcode/QR workflow exists, which is essential in a warehouse.
- No scan-review lane for failed quality, damage, dimension anomalies, or supervisor approval.
- No bulk import, CSV upload, customer shipment manifest, or receiving checklist.
- No search, filters, sort, pagination, or high-volume table behavior.
- No clear empty-state next action for the full warehouse flow.
- Mobile install page is a placeholder until TestFlight URL exists.
- Billing UI redirects to Paystack but has no callback handling or post-payment state refresh.
- Public tracking is mobile-friendly but generic; shipment timeline is mostly static and item pages show origin/destination as unknown.
- UI exposes live tracking button even though backend returns a feature-gated placeholder.

## Operational Flow Problems

- Admin cannot create real "expected packages" without dimensions.
- Customers can be attached to shipments and cargo items, but iOS item creation cannot assign a consignee.
- Operator must choose a shipment and package manually from menus; no scan-label lookup or guided task queue.
- Dashboard does not show "operator currently scanning" or lock a package while scanning.
- AI quality result is stored on `ScanResult`, but `CargoItem.status` is always set back to `SCANNED` after scan regardless of `PASS`, `REVIEW`, or `RESCAN`.
- Container loading accepts any item from the org, regardless of quality status, destination, shipment, container capacity, or container status.
- Customer notification event uses item ID as tracking code; no stable public tracking code exists.
- Shipment status changes do not create item-level timeline entries.

## Backend Audit

### Auth, Firebase, JWT, Refresh

- Email/password signup creates organization, admin user, and default warehouse.
- Firebase route verifies ID token and supports login or org creation.
- Access token expires in 15 minutes; refresh token is Redis-stored and rotated.
- Refresh tokens are single-device by hardcoded `rt:<userId>:default`, so one login overwrites another.
- Logout deletes the same single refresh token.
- Web frontend never uses `/auth/refresh`; iOS does use refresh on 401.

### Roles and Permissions

- `requireRole` is simple and mostly applied to admin/supervisor mutations.
- `authenticateEither` lets JWT users bypass API scopes, which is intended but should be documented and tested.
- Consignee mutations allow API-key users without scopes.
- Item and container API-key writes require `items:write`.
- There is no role hierarchy helper, no enum validation, and no explicit permission matrix tests.

### Tenant Isolation

- Most list/get/update routes filter by `req.org.id`.
- Global unique `Shipment.code` prevents two tenants from using the same shipment code; this is a product and tenant-isolation smell. Prefer `@@unique([organizationId, code])`.
- Public tracking ignores tenant by design but needs tracking tokens and privacy controls.
- `verifyTenant` is unused.

### Shipments, Items, Scans

- Shipments are minimal and usable.
- Items need optional dimensions until scanned.
- Scans create immutable-ish `ScanResult` records and update latest dimensions on `CargoItem`.
- Scan quality does not drive item workflow status.
- Photo URL can be stored at scan creation or patched later.
- Scan certificate hash covers measurement payload but not photo URL, item/customer/shipment, operator, quality, or timestamp.

### Containers

- Containers are a good pilot feature: create, list with utilization, update, assign/unassign items.
- Missing constraints: capacity overage, status gate, destination/shipment match, quality gate, loading audit event, sealed lock.
- Container tracking endpoint is explicitly a placeholder.

### Customers/Consignees

- CRUD exists and can link consignee to shipment.
- No duplicate detection, address fields, customer portal preferences, or consent evidence.
- `cbmRateOverride` exists but cost calculation is not consistently used.

### Billing/Paystack

- Checkout init route exists.
- Webhook updates org plan and subscription rows on `charge.success`.
- Amounts/currency are hardcoded and comments are ambiguous.
- No plan-code based subscriptions, cancel/downgrade handling, invoice history UI, or reconciliation job.

### API Keys and Webhooks

- API keys are hashed, prefixed, one-time secret return.
- Scopes are unvalidated strings.
- Webhook dispatcher signs and retries but does not use a durable queue.
- Webhook docs are stale relative to implementation.

### Notifications

- Email templates and SendGrid fallback exist.
- WhatsApp supports Meta and Twilio and logs notification attempts.
- Notification logs are not tenant-linked.
- Notification events are limited and not driven by a full package timeline.

### Redis

- Redis supports refresh tokens and API-key rate limiting.
- In-memory fallback is convenient for dev but unsafe if accidentally used in production.

### Prisma/Migrations

- Schema is broad but uses many unconstrained strings for statuses, roles, plans, and event names.
- Baseline migration is a no-op; later hardening migration creates full schema.
- Render migration resolve workaround suggests migration history was repaired manually and needs cleanup before production.

## Frontend Audit

- `App.jsx` is doing too much: auth, dashboard, all tabs, API helper, and admin in one file.
- API base URL defaults to `http://localhost:5000/api`; production build requires `VITE_API_URL`.
- Firebase public config is hardcoded fallback. This is not a secret, but production config should still be environment-owned.
- Auth supports email/password and Google sign-in.
- Session rehydration uses `/auth/me`; no access-token refresh.
- Operations tab creates shipments and items, displays queue and cards, and can create manual scan records.
- Customers tab can create/list consignees.
- Containers tab can create containers and assign/remove packages.
- Team tab can create/list users but exposes temporary passwords in UI.
- Billing tab initializes Paystack but has no callback route handling.
- Super-admin dashboard lists orgs/subscriptions but no actions.
- Tracking page is public and visually clean but lacks real timeline, privacy, and item route details.
- Missing UI for API keys, webhooks, audit logs, scan certificates, disputes, notifications, plan limits, and scan review.

## iOS Audit

- Login uses email/password and stores tokens in Keychain.
- Token refresh is implemented on 401.
- API base URL defaults to `https://cargoscan-api.onrender.com/api`, or `CARGOSCAN_API_URL` from Info.plist.
- Home loads shipments and items and lets operator select a package.
- Operator can create a package from iPhone, but it uses fake dimensions and no consignee.
- Linked scan flow saves dimensions, photo, quality data, and scan result.
- Quick Test Scan cannot save because no item is linked.
- AR scanner uses scene reconstruction/depth, floor detection, distance/tilt/motion gates, object outline, buffer averaging, edge fusion, manual corner fallback, and snapshot capture.
- Device readiness is not fully gated with a user-facing "LiDAR required" block.
- Simulator cannot validate LiDAR behavior.
- Offline queue stores only `ScanPayload`, not photo bytes or quality-check state, and sync is not lifecycle-triggered.
- Build attempt against generic iOS reached signing and failed because no provisioning profile for `nexus.Cargoscan` was available. This is a TestFlight/signing readiness blocker, not a Swift compile error.

## iOS/LiDAR Feasibility

LiDAR scanning is realistic for a private warehouse pilot if expectations are controlled. It can reduce manual tape measurement time and provide evidence photos, but it should not be treated as legally exact volume measurement without validation.

Expected accuracy depends on device, lighting, surface texture, operator angle, package shape, and box visibility. For regular cartons on a visible floor, a practical pilot target is often low single-digit centimeter error under controlled conditions. Irregular bags, reflective wrap, stacked cargo, occluded edges, dark surfaces, and poor floor-plane detection will degrade results.

Physical validation required:

- Test at least 100 packages across sizes, materials, colors, and shapes.
- Compare against tape-measured length/width/height and scale-derived/known dimensions where possible.
- Measure operator-to-operator variance.
- Test busy warehouse lighting and floor conditions.
- Test repeated scans of the same cargo before and after movement.
- Define tolerance policy, for example pass under 3-5% CBM gap, review 5-10%, rescan above 10%.

AI is useful for quality control: image clarity, cargo fully visible, occlusion, likely bad angle, damage flags, and operator guidance. AI should not be trusted as the authoritative dimension source, billing source, or fraud adjudicator. Dimensions should come from measurement pipeline plus human review thresholds.

## Deployment Audit

- Render backend deploy is configured with `/api/health`.
- Render resources are free-tier and region Oregon; acceptable for smoke tests, not production operations.
- `API_PUBLIC_URL` and `FRONTEND_URL` are manual env vars and critical for uploads/callbacks.
- Firebase Hosting serves Vite build output and rewrites all routes to `index.html`.
- Firebase auth frontend is configured, but backend requires `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Local storage provider is not production-safe on Render.
- No deploy-time frontend env validation.
- No `.env.example` visible in current file list for all required variables.

## Test Results

- `git status --short`: existing uncommitted changes before audit:
  - Modified `.firebase/hosting.Y2FyZ29zY2FuLWFwcC9kaXN0.cache`
  - Modified `cargoscan-app/src/App.jsx`
  - Modified `cargoscan-app/src/index.css`
  - Modified `cargoscan-backend/src/routes/tracking.js`
  - Modified Xcode `UserInterfaceState.xcuserstate`
  - Untracked `CARGOSCAN-AUDIT-2026-05-16.md`
  - Untracked `CARGOSCAN-FULL-SYSTEM-REPORT-2026-05-17.md`
- Frontend `node_modules`: present.
- Backend `node_modules`: present.
- `npm run build` in `cargoscan-app`: pass, built 42 modules.
- `npm run lint` in `cargoscan-app`: pass, no output.
- `npm run build` in `cargoscan-backend`: pass, Prisma Client generated.
- `npm test` in `cargoscan-backend`: pass, 4 tests passed.
- `npm audit --audit-level=moderate` in `cargoscan-app`: fail, 5 vulnerabilities: 2 moderate, 3 high. Packages include `brace-expansion`, `flatted`, `picomatch`, `postcss`, `vite`.
- `npm audit --audit-level=moderate` in `cargoscan-backend`: pass at moderate threshold, but reports 8 low vulnerabilities through Firebase Admin / Google Cloud dependency chain. Force fix would downgrade `firebase-admin`, so do not force blindly.
- `xcodebuild -project Cargoscan.xcodeproj -scheme Cargoscan -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build`: failed because CoreSimulator was unavailable and no matching iPhone 16 Pro simulator existed.
- `xcodebuild -project Cargoscan.xcodeproj -scheme Cargoscan -destination 'generic/platform=iOS Simulator' build`: failed because CoreSimulator was unavailable and DerivedData write to `~/Library` was blocked.
- `xcodebuild -project Cargoscan.xcodeproj -scheme Cargoscan -destination 'generic/platform=iOS' -derivedDataPath ... build`: reached signing and failed because no iOS App Development provisioning profile for `nexus.Cargoscan` was found and automatic signing is disabled.

## Recommended New Workflow

Adopt package-first operations:

1. `WAITING_FOR_SCAN`: package placeholder exists with label, shipment, consignee, expected metadata, but no trusted dimensions.
2. `SCANNING`: operator has claimed or opened the package on iPhone.
3. `NEEDS_REVIEW`: scan saved but quality is review, damage is flagged, dimensions are anomalous, or required photo is missing.
4. `RESCAN_REQUIRED`: scan quality failed or supervisor rejects measurement.
5. `READY_TO_LOAD`: scan passed or supervisor approved; package can be loaded.
6. `LOADED`: package assigned to a container and load event recorded.
7. `DELIVERED`: shipment/customer delivery completed.

Support today:

- Database: does not support cleanly because dimensions are required and statuses are too limited.
- Backend: partially supports status strings, but route logic forces `SCANNED` after scan and allows loading regardless of readiness.
- Frontend: partially visualizes queues, but queue logic is wrong and no review workflow exists.
- iOS: can scan linked items, but creates fake placeholder dimensions and lacks scan-claim state.

Required changes:

- Make `CargoItem.length`, `width`, `height`, `cbm`, `scanConfidence` nullable.
- Default `CargoItem.status` to `WAITING_FOR_SCAN`.
- Add status transition rules in backend.
- Add `trackingCode` or `publicToken` to `CargoItem` and `Shipment`.
- Add package label/QR generation and lookup.
- Add scan review endpoint and dashboard queue.
- Gate container loading to `READY_TO_LOAD` unless supervisor override.
- Store package timeline events for tracking and audit.

## Prioritized Action Plan

### Immediate Fixes

1. Replace scan-first item model with package-first nullable dimensions and explicit statuses.
2. Stop iOS from creating fake `1 x 1 x 1 cm` CBM packages.
3. Update scan create route to set `READY_TO_LOAD`, `NEEDS_REVIEW`, or `RESCAN_REQUIRED` based on quality result.
4. Gate container loading by package status, capacity, shipment/destination compatibility, and container status.
5. Move production photo storage to Supabase/S3/GCS and remove local storage from Render production.
6. Fix frontend npm audit vulnerabilities with normal dependency updates.
7. Add real web token refresh and reduce localStorage exposure risk.
8. Add backend request validation for all auth, shipment, item, consignee, container, billing, API key, and webhook routes.
9. Add dedicated public tracking tokens and privacy-safe tracking DTOs.
10. Set up Xcode signing, bundle ID ownership, capabilities, and TestFlight pipeline.

### Dashboard Redesign

- Build a receiving command center: package intake, scan queue, review queue, ready-to-load queue, loaded manifest.
- Add barcode/QR label generation and scan lookup.
- Add customer/package search and high-volume tables.
- Add container loading board with capacity warnings.
- Add exception handling for damaged, questionable, duplicate, or rescanned cargo.
- Add Developers tab for API keys/webhooks.

### Backend Hardening

- Centralize Prisma client.
- Introduce Zod schemas and enum-like constants.
- Add status transition service and tests.
- Add integration tests for full operational flow.
- Add durable queue for webhooks/notifications.
- Add audit logs to all material actions.
- Add rate limits to auth endpoints.
- Add plan enforcement tests.
- Add DB indexes for common tenant queries.

### iOS LiDAR Pilot Readiness

- Add LiDAR capability gate and clear unsupported-device screen.
- Add package label scan/lookup.
- Add consignee assignment or selected work queue.
- Persist offline photos and replay full scan/photo upload.
- Trigger offline sync on app launch and foreground.
- Add real-device QA matrix and operator training script.
- Prepare signing, provisioning, App Store Connect, and TestFlight.

### Storage and Deployment

- Use managed object storage for photos.
- Add CDN/private signed read policy if evidence photos should not be public.
- Upgrade Render resources or move to production-grade infra before paid launch.
- Add CI for frontend/backend/iOS builds.
- Add error tracking and structured logs.
- Add database backups and migration rollback procedure.

### Pilot Launch

- Limit to one warehouse, a small admin team, and known LiDAR iPhones.
- Use controlled package types first.
- Run dual measurement: tape and CargoScan for 2-4 weeks.
- Track scan accuracy, rescan rate, operator time, and customer disputes.
- Do not automate billing off LiDAR-only CBM until validated.

### Public SaaS Later

- Tenant billing and compliance.
- Data retention/export/deletion.
- Customer portal auth.
- Integration marketplace.
- Carrier/container tracking provider integration.
- Formal security review and penetration test.

## First Implementation Steps

1. Create a migration for nullable cargo item dimensions, status constants, `trackingCode`, and package timeline events.
2. Update `/items` create to accept placeholders without dimensions and default to `WAITING_FOR_SCAN`.
3. Update iOS `createCargoItem` to create a true placeholder.
4. Update `/scans` create to compute CBM server-side, save scan, and set item status from quality gates.
5. Update dashboard queues to show waiting, scanning, review/rescan, ready-to-load, loaded.
6. Update `/containers/:id/items` to load only `READY_TO_LOAD` packages and prevent over-capacity by default.
7. Configure Supabase/S3 storage in production and remove local storage from Render.
8. Add integration tests for shipment -> placeholder -> scan -> review -> load -> track.
9. Fix frontend audit vulnerabilities.
10. Configure iOS signing and run a real-device LiDAR build.
