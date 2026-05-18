# CargoScan Full System Report

Date: 2026-05-17  
Local project path: `/Users/truth/cargoscan`  
Repository: `johnsedofiadakey-hue/cargoscan`

## 1. Executive Summary

CargoScan is intended to be a freight-forwarding and warehouse cargo intelligence platform. The product combines a desktop web dashboard, a backend API, a Postgres database, Redis-backed sessions/rate limiting, Firebase-hosted web frontend, Firebase Google sign-in, Paystack billing, WhatsApp/email notifications, public shipment tracking, API/webhook access, and an iOS LiDAR scanning app.

The core promise of the system is:

- Create and manage freight shipments.
- Add customers/consignees.
- Create or scan cargo items.
- Measure package dimensions and CBM using a LiDAR iPhone.
- Upload scan photos.
- Use computer vision/AI quality checks to guide operators and reduce bad scans.
- Assign scanned packages into containers.
- Track container utilization.
- Share sanitized public tracking pages.
- Support plan-based billing and operational limits.
- Support developer/API integrations for higher tiers.

The project is feasible as a private pilot MVP, but it is not yet production-complete. The architecture is directionally correct, and many core modules exist. The biggest remaining work is not only coding; it is product workflow clarity, dashboard UX, real LiDAR accuracy validation on physical devices, durable photo storage, stronger test coverage, and TestFlight/App Store distribution.

## 2. System Purpose

CargoScan is trying to solve a practical warehouse problem: freight forwarders need to measure many cargo packages quickly, calculate CBM accurately, assign packages to shipments and containers, and keep customers updated without relying on slow manual measurements.

The intended operational flow is:

1. Admin creates a company workspace.
2. Admin or supervisor creates shipments.
3. Customers/consignees are added.
4. Cargo items are created manually or by the mobile app.
5. Operator uses a LiDAR iPhone to scan each package.
6. The iPhone app captures dimensions, CBM, photo evidence, scan quality metadata, and optional AI quality review.
7. Backend saves the scan and updates the cargo item.
8. Dashboard shows packages waiting, scanned, needing review, or loaded.
9. Admin assigns packages to containers.
10. Container utilization and manifest details are monitored.
11. Customer receives tracking or notification updates.
12. Higher tiers can use API keys, webhooks, and eventually live container tracking.

## 3. Current Project Structure

Root:

- `/Users/truth/cargoscan`

Main folders:

- `/Users/truth/cargoscan/cargoscan-app`
  - React/Vite web dashboard.
  - Firebase Hosting target.
  - Login/signup, tenant dashboard, operations, containers, customers, mobile app install, team, billing, public tracking.

- `/Users/truth/cargoscan/cargoscan-backend`
  - Node.js/Express backend.
  - Prisma/Postgres database.
  - Redis sessions/rate limit support.
  - Auth, shipments, items, scans, containers, billing, tracking, admin, webhooks, API keys, notifications.

- `/Users/truth/cargoscan/cargoscan-ios-project`
  - Native iOS app in Swift/SwiftUI.
  - Xcode project: `/Users/truth/cargoscan/cargoscan-ios-project/Cargoscan.xcodeproj`
  - LiDAR/ARKit scanning pipeline.

Important deployment files:

- `/Users/truth/cargoscan/render.yaml`
  - Render backend, Postgres, Redis blueprint.

- `/Users/truth/cargoscan/firebase.json`
  - Firebase hosting config for root deployment.

- `/Users/truth/cargoscan/cargoscan-app/firebase.json`
  - Firebase hosting config for frontend folder deployment.

Important report/docs already in repo:

- `CARGOSCAN-AUDIT-2026-05-16.md`
- `CARGOSCAN-DEPLOYMENT.md`
- `CARGOSCAN-PRODUCTION-ROADMAP.md`
- `CARGOSCAN-GAP-ANALYSIS.md`
- `CARGOSCAN-COMPLETE-README.md`

## 4. Deployment Architecture

Recommended/current deployment plan:

- Backend API: Render web service.
- Database: Render Postgres.
- Redis: Render Key Value.
- Web dashboard: Firebase Hosting.
- Authentication:
  - Backend JWT for app sessions.
  - Firebase Google Sign-In for web login/signup.
- iOS app:
  - Xcode direct install for testing today.
  - TestFlight recommended for pilot distribution.
  - App Store later.
- Storage:
  - Local storage exists.
  - Supabase Storage support exists in code.
  - Durable object storage is recommended before serious production use.

Current known public URLs:

- Backend API base: `https://cargoscan-api.onrender.com/api`
- Web dashboard: `https://cargoscan-app-2026.web.app`

## 5. Backend Overview

Backend stack:

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- Redis
- JWT auth
- bcrypt password hashing
- Paystack billing integration
- SendGrid email integration if configured
- WhatsApp via Meta Cloud API or Twilio if configured
- Optional OpenAI scan quality review
- Helmet security headers
- CORS allowlist
- Express rate limiting

Main backend entrypoint:

- `/Users/truth/cargoscan/cargoscan-backend/src/index.js`

Backend mounts these API namespaces:

- `/api/auth`
- `/api/items`
- `/api/shipments`
- `/api/containers`
- `/api/scans`
- `/api/disputes`
- `/api/admin`
- `/api/keys`
- `/api/webhooks`
- `/api/consignees`
- `/api/tracking`
- `/api/billing`
- `/api/users`
- `/api/health`

## 6. Backend Routes And Functions

### Auth

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/auth.js`

Routes:

- `POST /api/auth/signup`
  - Creates organization.
  - Creates first admin user.
  - Creates default warehouse.
  - Issues JWT token and refresh token.
  - Sends welcome email or logs mock email.

- `POST /api/auth/firebase`
  - Verifies Firebase Google ID token.
  - Logs in existing Google-linked user by email.
  - Creates a pilot organization if mode is signup.
  - Issues backend session.

- `POST /api/auth/login`
  - Email/password login.
  - Supports super-admin login through env-configured admin credentials.
  - Issues `token`, `accessToken`, `refreshToken`, `user`, `organization`.

- `POST /api/auth/refresh`
  - Refreshes short-lived access token using Redis-stored refresh token.

- `GET /api/auth/me`
  - Returns authenticated user and organization.

- `POST /api/auth/logout`
  - Deletes refresh token session.

Auth contract:

- `token`
- `accessToken`
- `refreshToken`
- `user`
- `organization`

Current concern:

- JWT access tokens expire in 15 minutes, so refresh behavior must be tested strongly on both web and iOS.
- Super-admin login is separate from normal tenant user logic.

### Shipments

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/shipments.js`

Routes:

- `GET /api/shipments`
  - Lists tenant shipments.
  - Includes cargo items and warehouse.
  - Computes `totalCbm` and `itemsCount`.

- `POST /api/shipments`
  - Admin/supervisor only.
  - Creates shipment.
  - Uses provided warehouse or first organization warehouse.
  - Enforces trial expiry and shipment limits.
  - Writes audit log.

- `PUT /api/shipments/:id`
  - Admin/supervisor only.
  - Updates shipment status.
  - Emits notification events for status changes.

Statuses:

- `OPEN`
- `LOADING`
- `SEALED`
- `IN_TRANSIT`
- `ARRIVED`
- `DELIVERED`

Current concern:

- Dashboard does not yet provide a complete polished shipment lifecycle UI.

### Cargo Items

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/items.js`

Routes:

- `GET /api/items`
  - Lists tenant cargo items.
  - Supports `shipmentId` query.
  - Includes scan results, shipment, consignee, container.

- `POST /api/items`
  - Creates cargo item.
  - Requires shipment and dimensions.
  - Optional consignee.
  - Calculates CBM from cm dimensions.
  - Enforces plan expiry and item limits.
  - Supports API-key or user auth.

- `GET /api/items/:id`
  - Returns specific item if tenant owns it.

- `PUT /api/items/:id`
  - Updates dimensions, status, damage state, consignee, description.
  - Recalculates CBM if dimensions change.

Item statuses:

- `SCANNED`
- `LOADED`
- `DELIVERED`

Current concern:

- Manual item creation requires dimensions up front. For a pure warehouse scanning workflow, it may be better to allow “pending item” creation before dimensions are known.

### Scans

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/scans.js`

Routes:

- `GET /api/scans/uploads/:key`
  - Public local upload serving route.

- `POST /api/scans/quality-check`
  - Authenticated.
  - Accepts image and scan metrics.
  - Runs local quality gates.
  - Optionally calls OpenAI if configured.

- `POST /api/scans`
  - Saves scan result.
  - Updates cargo item dimensions and CBM.
  - Supports API-key or user auth.
  - Issues scan certificate.
  - Writes audit log.
  - Emits `scan.created` event.

- `GET /api/scans/:cargoItemId`
  - Lists scans for a cargo item.

- `POST /api/scans/:cargoItemId/photo`
  - Creates upload URL for scan photo.
  - Supports local or Supabase storage provider.

- `PATCH /api/scans/:scanResultId`
  - Updates scan result details.

- `PUT /api/scans/upload-local`
  - Accepts raw upload for local storage.

Scan data includes:

- Length
- Width
- Height
- CBM
- Confidence
- Scanner device
- Photo URL
- Operator ID
- Source
- Quality status
- Quality score
- Quality reason
- Quality flags
- API key ID if submitted through API

Quality statuses:

- `PASS`
- `REVIEW`
- `RESCAN`

Current concern:

- Local storage is not durable for production.
- Real accuracy needs field validation on actual LiDAR hardware.
- AI quality check should not be sold as measurement truth; it is a guidance layer.

### Containers

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/containers.js`

Routes:

- `GET /api/containers`
  - Lists tenant containers.
  - Includes shipment, cargo items, consignee, latest scans.
  - Computes total CBM, items count, customer count, utilization.

- `POST /api/containers`
  - Admin/supervisor only.
  - Creates container.
  - Supports 20ft, 40ft, 40HQ.
  - Enforces plan expiry and container limit.

- `PUT /api/containers/:id`
  - Updates container status and metadata.

- `POST /api/containers/:id/items`
  - Assigns cargo item to container.
  - Sets item status to `LOADED`.

- `DELETE /api/containers/:id/items/:itemId`
  - Removes item from container.
  - Sets item status back to `SCANNED`.

- `GET /api/containers/:id/tracking`
  - Enterprise-gated.
  - Currently placeholder/manual provider response.

Container fields:

- Number
- Type
- Status
- Capacity CBM
- Destination
- Vessel
- Booking number
- Seal number
- Departure date
- Shipment link

Current concern:

- Live container tracking is a placeholder until a provider such as Shipsgo, Vizion, project44, or Terminal49 is integrated.

### Consignees / Customers

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/consignees.js`

Routes:

- `GET /api/consignees`
- `POST /api/consignees`
- `PUT /api/consignees/:id`
- `DELETE /api/consignees/:id`

Customer fields:

- Name
- Phone
- Email
- WhatsApp opt-in
- CBM rate override
- Notes
- Shipment link
- Cargo item links

Current concern:

- Customer relationship to shipment and item works, but UI needs richer management and search.

### Users / Team

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/users.js`

Routes:

- `GET /api/users`
  - Admin only.

- `POST /api/users`
  - Admin only.
  - Creates team user.
  - Enforces user limit.
  - Sends team invite.

- `PATCH /api/users/:id`
  - Admin only.
  - Updates user.

- `POST /api/users/:id/reset-password`
  - Admin only.

Roles:

- `ADMIN`
- `SUPERVISOR`
- `OPERATOR`
- `SUPER_ADMIN`

Current concern:

- Temporary password flow is acceptable for pilot but should become a secure invite/password setup flow.

### API Keys

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/apiKeys.js`

Routes:

- `GET /api/keys`
- `POST /api/keys`
- `DELETE /api/keys/:id`

Purpose:

- Let external systems integrate with CargoScan.
- API keys have prefixes and hashed secrets.
- Key secret is returned once.
- Scopes are stored as CSV.

Current concern:

- API management should live in a dedicated Developer/Admin console, not inside tenant warehouse operations.
- API docs and external onboarding need work.

### Webhooks

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/webhooks.js`

Routes:

- `GET /api/webhooks`
- `POST /api/webhooks`
- `DELETE /api/webhooks/:id`
- `GET /api/webhooks/:id/deliveries`

Purpose:

- Notify external systems about CargoScan events.
- Stores webhook signing secrets.
- Stores delivery records.

Current concern:

- Delivery retry behavior and UI visibility need deeper testing.

### Billing

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/billing.js`

Routes:

- `POST /api/billing/init`
  - Admin only.
  - Initializes Paystack checkout.
  - Supports STARTER, BUSINESS, ENTERPRISE.

- `POST /api/billing/webhook`
  - Raw-body Paystack webhook.
  - Verifies signature.
  - Handles `charge.success`.
  - Handles failure events such as `charge.failed`, `invoice.payment_failed`, `subscription.disable`.
  - Updates organization plan.
  - Creates subscription row.
  - Logs audit event.

- `POST /api/billing/override`
  - Intended for super admin.
  - Overrides org plan.

Plans shown in UI:

- STARTER: `$29 / month`
- BUSINESS: `$79 / month`
- ENTERPRISE: `$199 / month`

Current concern:

- Billing UI is basic.
- Currency handling should be finalized.
- Paystack subscription lifecycle needs more production testing.

### Admin

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/admin.js`

Routes:

- `GET /api/admin/organizations`
- `GET /api/admin/subscriptions`
- `GET /api/admin/audit-logs`

Purpose:

- Platform-level oversight of all tenants.

Current concern:

- Admin dashboard UI is minimal.

### Public Tracking

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/routes/tracking.js`

Routes:

- `GET /api/tracking/:code`
  - Public.
  - Finds shipment by code or cargo item by ID.
  - Returns sanitized DTO.

- `GET /api/tracking/_verify/:hash`
  - Public.
  - Verifies scan certificate hash.
  - Recently changed to return sanitized certificate DTO instead of raw relations.

Public tracking returns:

- Shipment code/status/origin/destination.
- Total CBM.
- Item count.
- Public cargo item fields.
- Photo URL if available.

Current concern:

- Tracking code currently allows direct cargo item ID lookup. For production, public tracking should use non-guessable public tracking tokens.

## 7. Database Model

Main entities:

- `Organization`
- `User`
- `Warehouse`
- `Shipment`
- `CargoItem`
- `ScanResult`
- `ScanCertificate`
- `Consignee`
- `Container`
- `Subscription`
- `AuditLog`
- `NotificationLog`
- `ApiKey`
- `Webhook`
- `WebhookDelivery`
- `Dispute`

Important relationships:

- Organization has users, warehouses, shipments, consignees, API keys, webhooks, subscriptions, audit logs, containers.
- Shipment belongs to organization and warehouse.
- Shipment has cargo items, consignees, containers.
- Cargo item belongs to shipment.
- Cargo item may belong to consignee.
- Cargo item may belong to container.
- Cargo item has scan results and scan certificates.
- Scan result belongs to cargo item and optionally operator/API key.
- Container has many cargo items.
- Webhook has many delivery records.

Strong design choices:

- Multi-tenant organization boundary is central.
- Container support exists in schema.
- Scan certificates exist for verification.
- Audit logs exist.

Weaknesses:

- `Shipment.code` is globally unique, not organization-scoped. This may be acceptable but can become restrictive.
- Public item tracking by item UUID should be replaced by public tracking tokens.
- Some models need more constraints and indexes for production scale.

## 8. Plan Limits

File:

- `/Users/truth/cargoscan/cargoscan-backend/src/lib/planLimits.js`

Trial:

- 2 users
- 5 shipments per month
- 50 items per month
- 1 API key
- 1 webhook
- WhatsApp disabled
- Disputes disabled
- 1 container
- Container tracking disabled

Starter:

- 3 users
- 30 shipments per month
- Unlimited items
- 5 API keys
- 5 webhooks
- WhatsApp disabled
- Disputes disabled
- 5 containers
- Container tracking disabled

Business:

- 10 users
- 200 shipments per month
- Unlimited items
- 20 API keys
- 20 webhooks
- WhatsApp enabled
- Disputes enabled
- 50 containers
- Container tracking disabled

Enterprise:

- Unlimited users
- Unlimited shipments
- Unlimited items
- Unlimited API keys
- Unlimited webhooks
- WhatsApp enabled
- Disputes enabled
- Unlimited containers
- Container tracking enabled

## 9. Web Dashboard Overview

Frontend stack:

- React
- Vite
- Firebase Hosting
- Firebase Auth SDK for Google sign-in
- Plain CSS

Important files:

- `/Users/truth/cargoscan/cargoscan-app/src/App.jsx`
- `/Users/truth/cargoscan/cargoscan-app/src/App.css`
- `/Users/truth/cargoscan/cargoscan-app/src/index.css`
- `/Users/truth/cargoscan/cargoscan-app/src/TrackingPage.jsx`

Current app sections:

- Login/signup
- Tenant dashboard
- Operations
- Containers
- Customers
- Mobile App
- Team
- Billing
- Super Admin dashboard
- Public tracking page

### Login/Signup

Current features:

- Email/password login.
- Email/password pilot org signup.
- Google sign-in.
- Google signup flow requires company/country/city first.
- Stores `cs_token` and `cs_refresh_token` in localStorage.
- Product-focused visual hero.

Current concern:

- localStorage tokens are acceptable for pilot, but production should consider stronger token/session handling.

### Operations Tab

Current features:

- Command center showing operational flow.
- Waiting package queue.
- Create shipment.
- Create cargo item.
- Shipment table.
- Cargo item cards.
- Manual scan save.
- Tracking links.

Current concern:

- Still too form-heavy.
- Needs drawers/modals, search, filters, scan review queue, and richer item cards with photos.

### Containers Tab

Current features:

- Create container.
- Move scanned package into container.
- Container cards.
- Utilization progress bar.
- Manifest list inside container.
- Remove package from container.
- Live tracking button.

Current concern:

- Live tracking is currently an Enterprise-gated placeholder.
- Loading workflow should become more visual and efficient.

### Customers Tab

Current features:

- Add customer/consignee.
- Phone, email, shipment, WhatsApp opt-in.
- Customer list.

Current concern:

- Needs search, customer detail page/drawer, customer cargo history.

### Mobile App Tab

Current features:

- Explains iOS scanner install.
- Shows TestFlight QR placeholder.
- Shows Xcode project path.
- Shows supported device notes.
- Shows install flow.

Current concern:

- No public TestFlight link yet.
- Today, iOS install is via Xcode.

### Team Tab

Current features:

- Admin can create user.
- Role selection: operator/supervisor/admin.
- Team list.

Current concern:

- Temporary password display needs replacement with proper invite flow.

### Billing Tab

Current features:

- Shows current plan.
- Shows Starter/Business/Enterprise.
- Starts Paystack checkout.

Current concern:

- Needs billing history, plan limits, trial expiry, active subscription state, failure handling UI.

### Super Admin Dashboard

Current features:

- Organization count.
- Subscription count.
- Active pilots count.
- Organization table.

Current concern:

- Very minimal.
- Needs health, incidents, subscription controls, audit logs, org impersonation or support tools.

## 10. iOS App Overview

iOS stack:

- Swift
- SwiftUI
- ARKit
- RealityKit
- Native URLSession networking
- Keychain storage for tokens

Xcode project:

- `/Users/truth/cargoscan/cargoscan-ios-project/Cargoscan.xcodeproj`

Important files:

- `CargoscanApp.swift`
- `LoginView.swift`
- `HomeView.swift`
- `ScannerView.swift`
- `ARScannerViewModel.swift`
- `MeasurementEngine.swift`
- `MeshProcessor.swift`
- `EdgeDetector.swift`
- `NetworkService.swift`
- `OfflineManager.swift`
- `KeychainHelper.swift`

### iOS Login

Functions:

- Email/password login against backend.
- Saves token and refresh token in Keychain.
- Refreshes token on 401.

Current concern:

- Google sign-in is web-only right now.
- iOS signup is not the primary path; operators should be invited from dashboard.

### iOS Home Flow

Current flow:

- Load shipments from backend.
- Select shipment.
- Load cargo items for shipment.
- Select cargo item.
- Optionally create item for scan.
- Start linked LiDAR scan.
- Quick test scan exists.

Current concern:

- Quick Test Scan should stay disabled or clearly test-only for pilot unless it creates/links a backend item.

### iOS Scanner

Scanner UI states:

- Finding floor.
- Positioning.
- Ready to scan.
- Object detected.
- Scanning.
- Processing.
- Completed.
- Manual corner tap mode.

Scanner guidance:

- Distance.
- Tilt.
- Motion.
- Object detection.
- LiDAR readiness.
- Quality coach.
- Visual outline.
- Reticle.
- Haptic feedback on detection.
- Result panel.

Measurement pipeline:

1. Use ARKit LiDAR scene depth or smoothed scene depth.
2. Convert depth pixels into world-space point cloud.
3. Detect floor plane.
4. Filter object points above floor.
5. Use height histogram to isolate object band.
6. Find top surface points.
7. Fit top plane using RANSAC.
8. Calculate height from floor to top plane.
9. Project points to top plane.
10. Build convex hull.
11. Use rotating calipers/min bounding rectangle for length and width.
12. Push measurements into rolling buffer.
13. Use outlier rejection.
14. Calculate confidence.
15. Produce final dimensions and CBM.

Strength:

- The iOS code is aiming at real LiDAR geometry, not fake dimensions.

Critical limitation:

- This must be validated on a real LiDAR iPhone. Simulator cannot test LiDAR accuracy.

## 11. AI And Computer Vision

Current AI quality endpoint:

- `/api/scans/quality-check`

Local quality gates:

- Confidence.
- Edge agreement.
- Stable frame count.
- Distance.
- Pitch angle.
- LiDAR point count.

Optional OpenAI quality check:

- Uses image plus scan metadata.
- Returns:
  - `status`
  - `score`
  - `reason`
  - `flags`
  - `guidance`

Important design principle:

- AI should not be used as the measurement engine.
- AI should be used as quality control and operator guidance.
- LiDAR/depth geometry remains the measurement truth.

Recommended next AI improvements:

- Detect occlusion.
- Detect multiple objects in frame.
- Detect if cargo is cut off.
- Detect poor lighting.
- Detect bad angle.
- Detect label/marking visibility.
- Recommend “step back,” “move left,” “center cargo,” “retake,” etc.

## 12. Notifications

WhatsApp:

- Supports Meta Cloud API.
- Supports Twilio fallback.
- Plan-gated.
- Writes `NotificationLog`.
- Skips safely when credentials are missing.
- Listens to scan and shipment events.

Email:

- SendGrid if configured.
- Mock logging if not configured.
- Templates exist for:
  - Welcome
  - Password reset
  - Payment failed
  - Trial ending
  - Team invite

Current concern:

- Notification UI/log visibility is not yet strong in dashboard.

## 13. External Integrations

Existing/partial integrations:

- Firebase Hosting.
- Firebase Google Sign-In.
- Firebase Admin token verification.
- Render backend/Postgres/Redis.
- Paystack checkout/webhooks.
- SendGrid email.
- Meta WhatsApp.
- Twilio WhatsApp fallback.
- OpenAI quality check.
- Supabase Storage support.

Future high-tier integration:

- Container live tracking provider.
- Candidate providers:
  - Shipsgo
  - Vizion
  - project44
  - Terminal49

Current live container tracking state:

- Endpoint exists.
- Enterprise gate exists.
- Provider is placeholder/manual.

## 14. Public Interfaces

Canonical API route names:

- `/api/auth`
- `/api/shipments`
- `/api/items`
- `/api/scans`
- `/api/consignees`
- `/api/users`
- `/api/keys`
- `/api/webhooks`
- `/api/billing`
- `/api/tracking`
- `/api/admin`
- `/api/containers`

Developer API support:

- API key creation.
- API key scopes.
- API key authentication middleware.
- Webhooks with signing secrets.
- Webhook delivery records.

Current concern:

- Developer console UI is currently not part of the tenant dashboard, by design after user feedback.
- Need a separate developer/admin product area later.

## 15. Security Review

Good security foundations:

- Passwords hashed with bcrypt.
- JWT auth.
- Refresh tokens stored hashed in Redis.
- Helmet enabled.
- CORS allowlist.
- Rate limiting.
- Tenant ownership checks in most routes.
- API keys store hashed secret parts.
- Paystack webhook signature verification.
- Public tracking uses DTOs for main tracking endpoint.
- Certificate verify endpoint recently sanitized.

Security gaps/risks:

- Public item tracking by raw item ID should be replaced with non-guessable public tracking code.
- localStorage token use in web is acceptable for pilot but not ideal long-term.
- Backend tests do not sufficiently prove tenant isolation.
- Team temporary password flow should be replaced.
- Production secrets must be audited in Render/Firebase.
- Raw super-admin behaviors need careful verification.
- Need more systematic permission tests across roles.

## 16. Reliability Review

Good reliability foundations:

- Health endpoint checks DB and Redis.
- Graceful shutdown handlers.
- Audit logs.
- Notification failures are generally non-fatal.
- Paystack idempotency for successful reference exists.
- Local fallback exists when OpenAI quality fails.

Reliability gaps:

- Backend test suite is too small.
- No full end-to-end automated test.
- No staging smoke script yet.
- Photo storage durability is not solved if local storage remains.
- Render free services can sleep, which affects pilot experience.
- iOS offline queue exists, but needs real-world retry testing.

## 17. Testing Status

Recently verified:

- Frontend build passed.
- Frontend lint passed.
- Backend tests passed.
- iOS simulator build passed.
- Frontend production audit clean.
- Backend audit has 8 low-severity vulnerabilities through Firebase/Admin dependency chain.

Current backend tests cover:

- Plan limit contract.
- Paystack webhook signature.
- Local storage URL contract.
- Canonical route mounts.

Missing tests:

- Auth signup/login/refresh/logout.
- Firebase login.
- Tenant isolation.
- Role permissions.
- Shipment CRUD/lifecycle.
- Item creation/update.
- Scan creation/photo upload.
- Quality check fallback.
- Container assignment/removal.
- Public tracking sanitization.
- Certificate verification sanitization.
- Paystack webhook idempotency/failure cases.
- Webhook delivery behavior.
- Notification failure behavior.
- API key authentication and scopes.

## 18. Production Readiness

Current readiness level:

- Private pilot groundwork: moderate.
- Public SaaS readiness: low.
- Real LiDAR accuracy readiness: unproven until physical device testing.

Ready for:

- Local development.
- Basic simulator iOS UI testing.
- Basic web dashboard testing.
- Backend route smoke testing.
- Private pilot preparation.

Not ready for:

- Public commercial launch.
- Accuracy claims without calibration/testing.
- Large customer onboarding.
- Production photo storage on local Render filesystem.
- Enterprise live container tracking claims.

## 19. Current Known Product Gaps

Dashboard:

- Needs a more professional desktop information architecture.
- Needs package search/filtering.
- Needs scan review queue.
- Needs photo previews.
- Needs shipment detail view.
- Needs item detail view.
- Needs container detail view.
- Needs customer detail view.
- Needs better empty states.
- Needs better loading/error states.
- Needs real API/developer console if sold as integration feature.

iOS:

- Needs physical LiDAR testing.
- Needs device-only gating for LiDAR-capable phones.
- Needs TestFlight distribution.
- Needs stronger offline retry validation.
- Needs calibration flow.
- Needs field accuracy test set.

Backend:

- Needs stronger tests.
- Needs tracking token model.
- Needs durable storage setup.
- Needs more indexes/constraints.
- Needs better billing subscription lifecycle.
- Needs provider integration for live container tracking.

Operations:

- Need a clear pilot onboarding checklist.
- Need seed/demo account process.
- Need support/runbook process.
- Need backup/export process.

## 20. Recommended Feature Set By Version

### Free / Trial

- 14-day pilot.
- 2 users.
- 5 shipments/month.
- 50 cargo items/month.
- 1 container.
- Manual scan entry.
- Limited iOS scanning for test.
- Public tracking.
- No WhatsApp automation.
- No live container tracking.
- No external API beyond 1 test key.

### Starter

- 3 users.
- 30 shipments/month.
- Unlimited items.
- 5 containers.
- iOS LiDAR scanning.
- Public tracking.
- Basic reports.
- Basic customer management.
- 5 API keys/webhooks.

### Business

- 10 users.
- 200 shipments/month.
- 50 containers.
- WhatsApp notifications.
- Dispute/review workflow.
- Scan quality review queue.
- Team roles.
- Webhooks/API integrations.
- Export manifests.

### Enterprise

- Unlimited users/shipments/items/containers.
- Live container tracking.
- Custom integrations.
- Dedicated onboarding.
- Advanced analytics.
- Priority support.
- Custom API/webhook limits.

## 21. Recommended Roadmap

### Phase 1: Dashboard Product Redesign

Goal:

- Make the desktop dashboard feel like the command center of the business.

Build:

- Operations home with package queue.
- Scan review queue.
- Shipment detail drawer.
- Item detail drawer with photo and latest scan.
- Container loading workspace.
- Customer detail view.
- Better mobile install page.

### Phase 2: Accuracy And iOS Pilot

Goal:

- Prove LiDAR measurement reliability.

Build:

- LiDAR-only device gate.
- Calibration screen.
- Field test protocol.
- Quality thresholds.
- Operator guidance improvements.
- TestFlight release.

### Phase 3: Backend Confidence

Goal:

- Make the system reliable enough for real pilot customers.

Build:

- Tenant isolation tests.
- Auth tests.
- Shipment/item/scan integration tests.
- Tracking privacy tests.
- Paystack webhook tests.
- Notification failure tests.

### Phase 4: Storage And Production Hardening

Goal:

- Stop relying on local upload storage.

Build:

- Supabase/S3 production bucket.
- Signed/public URL strategy.
- Backup/export docs.
- Staging smoke tests.
- Health monitoring.

### Phase 5: Developer And Enterprise Features

Goal:

- Create sellable higher-tier features.

Build:

- Developer console.
- API docs.
- Webhook logs UI.
- Live container tracking provider integration.
- Enterprise billing/limits.

## 22. Immediate Next Actions

Recommended order:

1. Finish dashboard redesign around warehouse flow.
2. Add scan quality review queue.
3. Add item detail drawer with photo/scan history.
4. Add shipment detail drawer.
5. Add container loading workspace improvements.
6. Set up TestFlight.
7. Test on a real LiDAR iPhone.
8. Move photos to durable object storage.
9. Add backend test suite.
10. Add public tracking token model.

## 23. Final Assessment

CargoScan has a strong concept and a meaningful technical foundation. The backend has many of the right entities and route surfaces. The iOS app has a serious LiDAR measurement pipeline. The dashboard is now beginning to point in the right direction, but it still needs a full product-quality redesign around actual warehouse operations.

The product can become very strong if we treat it as an operations system first, not just a set of forms. The scanner should feed truth into the backend. The dashboard should organize that truth into queues, exceptions, manifests, customer visibility, and container loading decisions.

The next big success metric is not “does the app open?” It is:

Can a warehouse operator scan 20 packages quickly on a LiDAR iPhone, and can an admin immediately see accurate package CBM, photos, quality status, customer assignment, and container loading impact on the desktop dashboard?

That is the real pilot target.

