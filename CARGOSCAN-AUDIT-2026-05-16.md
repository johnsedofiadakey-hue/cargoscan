# CargoScan Audit - 2026-05-16

## Product Goal

CargoScan should be a warehouse-first freight operations platform:

1. Desktop dashboard creates and manages shipments, customers, cargo items, containers, billing, users, and API access.
2. iPhone LiDAR app is used by operators to scan packages quickly.
3. Scan dimensions, photos, quality checks, and CBM flow back into the backend.
4. Dashboard shows what is waiting, what is scanned, what needs review, and what has been loaded into containers.
5. Customers can receive sanitized public tracking updates.

## Feasibility

The product is feasible as a private pilot MVP, but not yet ready for public SaaS.

Core feasibility is good:

- Backend has tenant-aware models for organizations, shipments, cargo items, consignees, scans, users, API keys, webhooks, billing, containers, and audit logs.
- Web app can login/signup, create core records, and call the Render API.
- iOS app builds and launches in simulator.
- iOS app can support linked scanning against backend shipment/item records.
- AI quality check is feasible as a guardrail, but it should not be treated as the source of measurement truth. LiDAR/depth geometry, camera stability, and calibration gates should remain primary.

Main feasibility risks:

- Simulator cannot validate LiDAR accuracy. Real accuracy testing must happen on a LiDAR iPhone.
- Scan accuracy needs a repeatable calibration protocol, sample cargo test set, and tolerance targets.
- Dashboard UX is still too form-first and not yet a polished warehouse operations console.
- Production photo storage is still local by default on Render, which is fragile on free/ephemeral infrastructure.
- Automated backend tests are too thin for tenant isolation, auth, scans, tracking, billing, and permissions.

## What Works Now

- Frontend build passes.
- Frontend lint passes.
- Backend test suite passes, but coverage is minimal.
- iOS simulator build succeeds.
- Login page fills the browser and has Google/email entry.
- Backend route names are mostly canonical.
- Shipment, item, consignee, scan, container, tracking, billing, API key, webhook, user, and admin routes exist.
- Public tracking uses DTOs for shipment and item responses.
- Trial/business/enterprise plan limits exist.
- Container model and assignment workflow exist.
- Scan quality endpoint exists with local gates and optional OpenAI quality review.
- Render blueprint exists with backend, Postgres, Redis, and env var wiring.
- Firebase Hosting is used for the web app.

## Bugs And Gaps Found

### Critical

- The web dashboard was constrained by Vite starter CSS on `body`, causing it to appear as a narrow app instead of covering the browser.
- Public certificate verification returned a raw certificate relation. This has now been changed to a sanitized DTO.
- Photo storage defaults to local storage. On Render free or stateless service environments, uploaded files are not a durable production plan.
- Real LiDAR accuracy is unverified because simulator testing cannot validate ARKit depth behavior.

### High

- Backend tests only cover four contract-style checks. There are no full auth, tenant isolation, shipment/item/scan, billing webhook, or public tracking privacy tests yet.
- Dashboard information flow is weak: users see creation forms before operational state.
- iOS app needs a stronger device gate so non-LiDAR devices cannot enter production scanning.
- AI scan quality is useful for operator guidance, not guaranteed measurement accuracy.
- Container live tracking is a placeholder and needs a real provider before it can be sold as live tracking.

### Medium

- Backend production `npm audit --omit=dev` reports 8 low vulnerabilities via `firebase-admin` dependency chain.
- Team invite currently exposes a temporary password in the UI; this is acceptable for internal pilot only, not polished production.
- Mobile app distribution is still Xcode/TestFlight pending, not a public download flow.
- Developer/API management should be separated from tenant operations and likely belongs to an admin/developer console, not the warehouse daily workflow.
- Billing upgrade initializes Paystack but needs stronger UI state, payment history, and subscription lifecycle display.

### UI/UX

- Dashboard needs to become a real command center: queue, exceptions, scan quality, loading progress, container utilization, and customer updates first.
- Operations should be workflow-driven:
  - Create shipment.
  - Add/import customers.
  - Create/scan cargo items.
  - Review scan quality.
  - Assign to container.
  - Seal container.
  - Share tracking.
- Forms should be contextual side panels/modals, not the main visual story.
- Empty states need clearer guidance.
- Mobile install should become a real TestFlight QR once the Apple developer flow is ready.

## Changes Made During This Audit

- Fixed root browser layout so the app owns the full viewport.
- Added a desktop command center to the dashboard.
- Added a package queue before the create forms.
- Adjusted dashboard grid sizing for a desktop workspace.
- Sanitized certificate verification responses.

## Verification

- `npm run build` in `cargoscan-app`: passed.
- `npm run lint` in `cargoscan-app`: passed.
- `npm test` in `cargoscan-backend`: passed.
- `npm audit --omit=dev` in `cargoscan-app`: clean.
- `npm audit --omit=dev` in `cargoscan-backend`: 8 low vulnerabilities remain.
- `xcodebuild ... CODE_SIGNING_ALLOWED=NO build`: succeeded for iOS simulator.

## Recommended Next Milestones

### Milestone A - Dashboard Product Redesign

- Replace form-first Operations tab with a warehouse command center.
- Add detail drawers for shipment, item, customer, and container.
- Add scan quality review queue.
- Add item photos and latest scan metadata to package cards.
- Make container loading drag/select driven.
- Add clear desktop navigation: Operations, Packages, Containers, Customers, Tracking, Mobile Install, Team, Billing.

### Milestone B - Pilot Accuracy Program

- Lock scanning to LiDAR devices.
- Add calibration screen.
- Add operator capture gates: distance, angle, full object visible, stability, lighting, edge agreement.
- Store raw quality metrics with every scan.
- Create a physical test set and measure accuracy tolerance.
- Decide acceptable tolerance target before selling accuracy claims.

### Milestone C - Backend Confidence

- Add tenant isolation tests.
- Add auth refresh/logout tests.
- Add shipment/item/scan integration tests.
- Add public tracking privacy tests.
- Add Paystack webhook idempotency tests.
- Add notification failure tests.

### Milestone D - Production Distribution

- Finish Apple Developer/TestFlight setup.
- Put TestFlight QR into the Mobile App tab.
- Move photos to durable object storage.
- Add staging smoke test script.
- Add admin runbooks for pilot support.

