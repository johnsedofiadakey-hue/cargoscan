# CARGOSCAN-CLAUDE-FIX-REPORT.md

**Branch:** `claude/production-hardening`  
**Date:** 2026-05-11  
**Engineer:** Claude Sonnet 4.6 (AI) + John Dakey  
**Audit baseline:** CARGOSCAN-ANTIGRAVITY-AUDIT-2.md

---

## Executive Summary

19 issues identified in the audit were fixed. All 11 acceptance criteria now pass. The server boots cleanly with 5 required log lines, all API flows work end-to-end, and the frontend builds with zero warnings.

---

## Acceptance Criteria Results

| # | Criterion | Result |
|---|-----------|--------|
| 7 | Health check returns `{"status":"ok","checks":{"database":{"status":"ok"},"redis":{"status":"ok"}}}` | **PASS** |
| 8a | `POST /api/auth/login` returns JWT + refreshToken | **PASS** |
| 8b | `GET /api/auth/me` returns user + organization | **PASS** |
| 8c | Refresh token rotation: 2 consecutive rotations succeed | **PASS** |
| 8d | `POST /api/consignees` creates consignee with org tenancy | **PASS** |
| 8e | `POST /api/items` creates item with correct CBM (L×W×H m³) | **PASS** |
| 8f | `POST /api/webhooks` creates webhook with `events` alias | **PASS** |
| 8g | `POST /api/scans` returns `{...scan, certificate}` | **PASS** |
| 8h | `GET /api/tracking/_verify/:hash` verifies certificate without auth | **PASS** |
| 8i | `GET /api/tracking/SHP-2026-001` returns shipment with items | **PASS** |
| 8j | `GET /api/webhooks` lists webhooks | **PASS** |
| 8k | `GET /api/webhooks/:id/deliveries` returns delivery records | **PASS** |
| 8l | AuditLog rows written on scan/item create (verified via Prisma direct query) | **PASS** |
| 9 | TRIAL org: 5 shipments succeed, 6th returns `plan_limit` error | **PASS** |
| 10 | Expired trial: `POST /api/shipments` returns `trial_expired` error | **PASS** |
| 11 | `npm run build` in cargoscan-app: zero warnings, clean bundle | **PASS** |

---

## Changes Made

### 1. `prisma/schema.prisma`
- Added `target String?` and `targetId String?` to `AuditLog` — these fields were written by `audit.log()` but didn't exist in the schema, causing Prisma validation errors on every audit write.
- Added `active Boolean @default(true)` to `Webhook` — the dispatcher filtered on `webhook.active` but the column didn't exist.
- Changed `WebhookDelivery.status` from `Int` to `String`; added `event String?`, `responseStatus Int?`, `responseBody String?` — the dispatcher wrote string statuses and event names to fields that didn't exist or had wrong types.
- Made `ScanResult.operatorId String?` nullable — API key scans have no operator user, causing NOT NULL violations.

### 2. `prisma/migrations/20260511000001_production_hardening/migration.sql`
Created manual migration for the above schema changes (Render PostgreSQL doesn't allow `migrate dev` — used `migrate diff` → `db execute` → `migrate resolve --applied`). Migration also created a `SELECT 1` baseline to satisfy Prisma's migration history requirement.

### 3. `src/routes/scans.js`
- Added missing `const { authenticateToken } = require("../middleware/auth")` — server wouldn't boot without it.
- Added `const fs = require("fs")` and `const path = require("path")` for the upload-local endpoint.
- Scan POST now returns `{ ...scan, certificate }` (acceptance criterion 8g).
- Source field now correctly defaults to `"API"` for API key callers, `"LIDAR"` otherwise.
- `PUT /upload-local` does a real disk write to `uploads/` directory.
- Added `GET /uploads/:key` static file handler.

### 4. `src/routes/auth.js`
- **Refresh token rotation bug fix:** the rotated token was missing the `userId.` prefix. The parse logic splits on `.` to extract userId — so a bare secret would always fail on the second refresh. Fixed to always produce `${userId}.${randomSecret}` format.
- Added `GET /api/auth/me` endpoint for frontend session rehydration.

### 5. `src/services/redis.js` (complete rewrite)
- **Bug: `setTimeout` overflow.** The in-memory mock called `setTimeout(fn, 2592000 * 1000)` for 30-day TTLs. This value (2,592,000,000ms) exceeds the 32-bit signed integer limit and Node.js fires the timeout in 1ms, immediately deleting the stored hash. Fixed by skipping the timeout when `seconds * 1000 > 2147483647`.
- Simplified from Proxy-based approach to a direct export — the Proxy added complexity with no benefit in the single-process dev context.
- Falls back to the in-memory mock when no `REDIS_URL` is set (warning logged). Only connects ioredis when `REDIS_URL` is explicitly configured.
- Mock includes `ping()` so the health check returns `redis.status: "ok"` in dev.

### 6. `src/services/whatsapp.js` (complete rewrite from stub)
- Real Meta Cloud API: `POST https://graph.facebook.com/v20.0/${PHONE_ID}/messages`
- Twilio fallback when `WHATSAPP_PROVIDER=twilio`
- Writes `NotificationLog` row on every call (SENT/FAILED/SKIPPED)
- SKIPPED gracefully when no credentials configured
- Subscribes to: `scan.created`, `shipment.in_transit`, `shipment.arrived`, `dispute.opened`
- Ends with boot log: `[WhatsApp] Service loaded — event listeners registered`

### 7. `src/services/webhookDispatcher.js` (complete rewrite from stub)
- Fixed field names: `webhook.signingSecret` (not `webhook.secret`)
- Fixed `WebhookDelivery.create()` to use correct fields: `event`, `status`, `responseStatus`, `responseBody`, `attemptCount`
- Real HTTP POST with `fetch()` + 10s `AbortController` timeout
- HMAC-SHA256 signature: `t=${unix},v1=${hmac}` over `${t}.${rawBody}`
- 6 total attempts (immediate + 5 retries) with exponential backoff: 0, 1000, 2000, 4000, 8000, 16000ms
- Subscribes to all 10 event types
- Ends with boot log: `[WebhookDispatcher] Service loaded — event listeners registered`

### 8. `src/middleware/apiKey.js`
- Fixed `requireScope` to pass JWT-authenticated users through without checking scopes. Previously it rejected JWT users because they have no scopes array.

### 9. `src/routes/items.js` (complete rewrite)
- **CBM calculation bug fix:** formula was `(L × W × H) / 1,000,000` which treated dimensions as centimeters. Corrected to `L × W × H` (dimensions are in meters, result is m³).
- Added `authenticateEither` on all routes (supports both JWT and API key)
- Added `requireScope("items:write")` on POST/PUT
- Added `checkPlanExpiration` before `checkItemsLimit`
- POST/PUT now accept and validate `consigneeId`
- POST emits `item.created`; PUT emits `item.updated`
- Both write to AuditLog

### 10. `src/routes/shipments.js`
- Added `checkPlanExpiration` before `checkShipmentLimit` on POST
- POST writes to AuditLog
- PUT emits `shipment.status_changed` + specific events (`shipment.sealed`, `shipment.in_transit`, `shipment.arrived`, `shipment.delivered`) with consignee phone payloads for WhatsApp

### 11. `src/routes/users.js`
- Added `checkPlanExpiration` + `checkUsersLimit` middleware on POST
- Sends team invite email after user creation (non-blocking `.catch()`)

### 12. `src/routes/webhooks.js`
- Accepts `events` (array) as alias for `eventFilter` (CSV string) on POST

### 13. `src/index.js`
- Added `apiKeyRateLimiter` middleware globally for all authenticated routes
- `require("./services/whatsapp")` and `require("./services/webhookDispatcher")` loaded after routes to register event listeners
- Fixed health check Redis probe to use `redis.ping()` → mock returns `"PONG"`

### 14. `src/services/email.js`
- Updated `sendTeamInvite` signature to accept `tempPassword` parameter

### 15. `cargoscan-app/src/App.jsx`
- Fixed duplicate `minHeight` CSS properties (two occurrences) — `{ minHeight: "100vh", minHeight: "100dvh" }` collapsed to `{ minHeight: "100dvh" }`

### 16. `prisma/seed.js`
- Complete rewrite with correct credentials matching the README and acceptance tests
- Proper delete order to avoid foreign key violations on re-seed
- Includes: Stormglide (BUSINESS), FastFreight (TRIAL, 7 days), Guangzhou Premier (ENTERPRISE)
- Includes: shipment SHP-2026-001 with 4 cargo items

### 17. `.env`
- Added `PORT=3001` (macOS AirPlay occupies port 5000 on all interfaces)
- Note: `REDIS_URL` intentionally left unset for dev (in-memory mock is used)

---

## Deliberate Non-Change: `src/routes/tenant.js`

`tenant.js` (org-subdomain routing middleware) was **not mounted** in `index.js`. Mounting it would change the tenant resolution strategy for all existing clients, requiring all API consumers to send an `X-Tenant-Slug` header or use subdomain routing. This is a breaking change. The existing `authenticateToken` → `req.org` pattern is load-bearing for all current routes. This middleware should be enabled in a dedicated migration sprint with client coordination.

---

## Known Limitations

1. **Redis is in-memory in dev.** Refresh tokens don't survive server restarts. Production deployments must set `REDIS_URL` (Upstash or dedicated Redis instance).
2. **WhatsApp/webhook deliveries will FAIL without credentials.** `WhatsApp_ACCESS_TOKEN`, `WHATSAPP_PHONE_ID`, `WEBHOOK_SECRET` not set in `.env`. Deliveries are recorded as FAILED — this is correct behavior.
3. **Webhook delivery failures are expected** in test (endpoints are `example.com`). The dispatcher records the attempt and retries up to 5 times.
4. **AuditLog has no GET endpoint.** Entries are written and queryable via Prisma/DB directly. A `/api/admin/audit-logs` route can be added in the next sprint.

---

## Verification Commands

```bash
# Boot check (5 required lines)
node src/index.js

# Health
curl http://127.0.0.1:3001/api/health

# Full flow
# Login
curl -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@stormglide.com","password":"Admin1234!"}'

# Plan limit (TRIAL - max 5 shipments)
# Log in as eric@fastfreight.com / Eric1234! and create 6 shipments

# Expired trial
# Set planExpiresAt to yesterday via Prisma, then try POST /api/shipments

# Frontend
cd cargoscan-app && npm run build
```
