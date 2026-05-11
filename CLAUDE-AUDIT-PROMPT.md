# CargoScan — Production Hardening Brief for Claude Code

You are working inside the CargoScan repository. CargoScan is a multi-tenant
SaaS for measuring freight CBM (cubic metres) for forwarders shipping on the
China-Ghana corridor. Stack:

- Backend: Express + Prisma + PostgreSQL (`cargoscan-backend/`)
- Web app: React + Vite (`cargoscan-app/`)
- iOS scanner: SwiftUI + ARKit LiDAR (`cargoscan-ios-project/`)

The project has been audited twice already. Two earlier waves of work (a
human and another agent) shipped partial fixes; each round left specific
bugs and stubs documented in audit files in this folder.

**Your mission:** read the audit history, then conduct a full re-audit
yourself, then fix every issue end to end until the system actually works.
"Works" is defined by the Acceptance Criteria at the bottom of this file.
Run them. Don't declare done until they pass.

---

## Required reading, in this order

All five docs are in the repo root:

1. `CARGOSCAN-COMPLETE-README.md` — the original product spec the founder
   wrote. Tells you what the system is meant to do.
2. `CARGOSCAN-PRODUCTION-ROADMAP.md` — the full Phase 0 → 6 build plan.
3. `CARGOSCAN-GAP-ANALYSIS.md` — what was missing on day one.
4. `CARGOSCAN-PHASE1-STATUS.md` — what was built in Phase 1.
5. `CARGOSCAN-ANTIGRAVITY-AUDIT.md` — first audit findings (~30 issues).
6. `CARGOSCAN-ANTIGRAVITY-AUDIT-2.md` — **second audit. Start fixes from
   here.** The "Must-fix-before-it-boots" list is non-negotiable.

Read them all before touching any code. They are the institutional memory.

---

## Method

1. Read all six context docs.
2. `cd cargoscan-backend && npm install --ignore-scripts`. Watch for missing
   deps. The audit calls out that `@sendgrid/mail`, `@supabase/supabase-js`,
   `ioredis`, and `nodemailer` are required by the code but missing from
   `package.json`. Add them.
3. Run `for f in src/index.js src/middleware/*.js src/routes/*.js
   src/services/*.js src/lib/*.js; do node --check "$f" || echo "FAIL $f";
   done`. Fix any syntax failures.
4. `node src/index.js` — try to boot. If it crashes, fix what crashes and
   try again. Repeat until it boots clean.
5. Implement the "Must-fix-before-it-boots" items from audit-2 in order.
6. Then "must-fix-before-customers".
7. Then "must-fix-before-launch".
8. For each fix:
   - Make the change.
   - Re-run `node --check` on touched files.
   - Where possible, write a smoke test (curl, manual call, or actual unit
     test).
   - Mark progress in `CARGOSCAN-CLAUDE-FIX-REPORT.md` (you'll create this).
9. **Do not write stubs.** If you need to call the Meta Cloud API, write
   the real `fetch()`. If you need to deliver webhooks, write real HTTP
   POST + HMAC + retries. If you need a Supabase upload, write a real
   presigned URL. Stubs are what got us to "60 % done"; we need 100 %.

---

## Specific must-fixes (verbatim from AUDIT-2)

Address every one. After each, mark `[FIXED]` in the audit-2 doc and in
your final report. If you skip one, explain why in the report.

### Server-doesn't-start bugs (1 hour total)

1. **`src/routes/scans.js`** references `authenticateToken` on lines 106,
   124, 151 but only imports `authenticateEither`. Either add the import
   or replace the call sites.
2. **`src/index.js`** never `require()`s `services/whatsapp.js` or
   `services/webhookDispatcher.js`, so their event listeners never
   register. Add both `require()` lines after the routes are mounted.

### Schema mismatches that throw at runtime

3. **`prisma/schema.prisma` AuditLog model** lacks `target` and `targetId`
   columns, but `lib/audit.js` writes them. Either add the columns or
   change the helper to fold them into `details`.
4. **`services/webhookDispatcher.js`** reads `webhook.secret` (schema has
   `signingSecret`), filters on `webhook.active` (no such column), and
   writes `WebhookDelivery.event/statusCode/response` (none exist). Fix
   both schema and code so they line up. Suggested: add `active Boolean
   @default(true)`, `event String`, `responseStatus Int?`, `responseBody
   String?`, `attempts Int @default(0)` to the dispatcher's writes.

### Auth flow holes

5. **Refresh-token rotation** in `routes/auth.js` returns a new token
   without the `userId.` prefix the parser expects. Prefix with
   `${userId}.` before returning. Hash only the secret half.
6. **Add `GET /api/auth/me`** to `routes/auth.js`. Verifies the JWT,
   returns `{user, organization}`. The frontend needs this for session
   rehydration.

### Stubs that need real implementations

7. **`services/whatsapp.js`** currently `console.log`s and returns a fake
   message ID. Write the real Meta Cloud API call:
   - `POST https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`
   - Use `Authorization: Bearer ${WHATSAPP_TOKEN}`.
   - Body: `{messaging_product:"whatsapp", to, type:"template", template:
     {name, language:{code:"en_US"}, components:[{type:"body",
     parameters:[...]}]}}`.
   - Fallback to Twilio if `WHATSAPP_PROVIDER=twilio` is set
     (`POST https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`).
   - Write every send to `NotificationLog` with status SENT/FAILED/SKIPPED
     and the providerRef when available.
   - Provide proper templates for `cargo_received`, `shipment_departed`,
     `cargo_arrived`, `dispute_opened`, `dispute_review_pending`. The
     bodies are in `CARGOSCAN-COMPLETE-README.md` §10.
8. **`services/webhookDispatcher.js`** currently logs but doesn't HTTP.
   Implement:
   - `fetch(webhook.url, {method:"POST", headers:{Content-Type, X-CargoScan-Event,
     X-CargoScan-Delivery, X-CargoScan-Signature: t=<unix>,v1=<hmac>}, body})`.
   - HMAC SHA-256 with `signingSecret` over `${t}.${rawBody}`.
   - 10 s timeout via `AbortController`.
   - On non-2xx or network error: retry up to 5 times with exponential
     backoff (1, 2, 4, 8, 16 s).
   - Persist each attempt to `WebhookDelivery` with the real fields.
9. **`routes/scans.js`** has a `PUT /upload-local` that returns "uploaded
   successfully (simulated)" without writing bytes. Either implement
   real disk write into `./uploads/<key>` (with a matching GET) or
   delete it and require Supabase.

### Routes still on the old code path

10. **`routes/items.js`** is unchanged from day one. Switch to
    `authenticateEither` + `requireScope("items:write")`. Accept
    `consigneeId` on POST/PUT (validate it belongs to the same shipment).
    Apply `checkPlanExpiration` + `enforceLimit("itemsPerMonth")`. Emit
    `item.created` / `item.updated` events.
11. **`routes/shipments.js` PUT** changes status but doesn't emit events.
    Emit `shipment.status_changed` always, plus the specific event for
    the new status: `shipment.sealed`, `shipment.in_transit`,
    `shipment.arrived`, `shipment.delivered`. WhatsApp listens for these.
12. **`routes/users.js`** doesn't send a team_invite email on user
    creation and doesn't enforce the users cap. Call
    `sendTeamInvite(email, name, loginUrl, tempPassword)` and add
    `enforceLimit("users")`.
13. **`routes/apiKeys.js`** needs `enforceLimit("apiKeys")` on POST.
14. **`routes/webhooks.js`** needs `enforceLimit("webhooks")` on POST.

### Consignee schema regression

15. The current `Consignee` model is org-scoped (no `shipmentId`). The
    UI and tracking page assume per-shipment consignees so each container
    can have its own group of customers with their own CBM totals. Add
    `shipmentId String?` + a relation to Shipment, keep `organizationId`,
    and update `routes/consignees.js` GET to filter by `?shipmentId=...`.

### Middleware that's defined but never mounted

16. **`middleware/tenant.js`** isn't `app.use()`d. Either mount it after
    `app.use(express.json())` in `index.js` (and exempt `/api/tracking`
    and `/api/billing/webhook`), or delete the file. Make a call.
17. **`middleware/rateLimit.js`** is only applied inline in `scans.js`.
    Mount globally in `index.js` after auth middleware so it applies to
    every API-key request, not just scans.

### Frontend

18. `cargoscan-app/src/App.jsx` lines 525 and 729 both have
    `minHeight: "100vh", minHeight: "100dvh"` — duplicate object keys.
    Drop the `100vh`. This is the THIRD time this has regressed; please
    make it stick.

### Package.json

19. Add to `dependencies` in `cargoscan-backend/package.json`:
    `@sendgrid/mail`, `@supabase/supabase-js`, `ioredis`, `nodemailer`.
    Run `npm install` after adding.

---

## Acceptance criteria — VERIFY EVERY ONE

Don't write the final report until ALL of these pass. The previous round
shipped 18 items that failed the first check; that's why I'm being
explicit.

1. `cd cargoscan-backend && npm install` completes without errors.
2. `node --check src/index.js` and `node --check` on every
   `src/{middleware,routes,services,lib}/*.js` returns no failures.
3. `npx prisma validate` succeeds.
4. `npx prisma migrate dev --name production_hardening` succeeds against
   the docker-compose Postgres.
5. `node prisma/seed.js` completes without throwing.
6. `node src/index.js` boots and logs:
   - `Server running on port <PORT>`
   - WhatsApp service loaded (some log line confirming the listener
     registered)
   - Webhook dispatcher loaded (some log line confirming the listener
     registered)
   - Scheduler started
7. `curl http://localhost:5000/api/health` returns 200 with
   `database.status: "ok"` and `redis.status: "ok"`.
8. End-to-end curl flow against the seeded data (replace `$T` with the
   real JWT from step a):

   a. `POST /api/auth/login` with `john@stormglide.com` → 200 with
      `token` and `refreshToken`.
   b. `GET /api/auth/me` with `Authorization: Bearer $T` → 200 with
      `user` and `organization`.
   c. `POST /api/auth/refresh` with the refreshToken → 200 with a NEW
      refreshToken that still has `userId.` prefix.
   d. `POST /api/auth/refresh` with the second refreshToken → 200 again
      (i.e. rotation works repeatedly, not just once).
   e. `POST /api/consignees` with `{shipmentId, name:"Test", phone:"+233244000111", whatsappOptIn:true}`
      → 201.
   f. `POST /api/items` with `{shipmentId, consigneeId, length, width, height}`
      → 201.
   g. `POST /api/webhooks` with `{name, url:"https://webhook.site/<your-uuid>",
      events:["scan.created"]}` → 201 with the signing secret.
   h. `POST /api/scans` with `{cargoItemId, length, width, height, cbm,
      confidence, scannerDevice}` → 201; response contains
      `certificate.hash`.
   i. `GET /api/tracking/_verify/<hash>` → 200 with the certificate
      details.
   j. `GET <webhook.site URL>` → shows one delivery in the inbox with a
      valid `X-CargoScan-Signature` header.
   k. `SELECT * FROM "AuditLog" WHERE action='CREATE' ORDER BY "createdAt"
      DESC LIMIT 1;` via Prisma — shows the scan creation.
   l. (Optional, if you've wired Meta) — the consignee gets a real
      WhatsApp. Otherwise verify the NotificationLog row exists with
      status SENT or SKIPPED.

9. Plan-limit smoke test: create a fresh TRIAL org, make 5 shipments
   (succeed), then the 6th should return 429 with `code: "plan_limit"`.
10. Trial-expired smoke test: set an org's `planExpiresAt` to yesterday
    and try `POST /api/shipments` — should return 402 with
    `code: "trial_expired"`.
11. Frontend builds cleanly: `cd cargoscan-app && npm install && npm run build`
    completes with zero warnings about duplicate object keys.

---

## Final report

When all acceptance criteria pass, write `CARGOSCAN-CLAUDE-FIX-REPORT.md`
in the repo root with these sections:

1. **Summary** — one paragraph: what you fixed, anything you skipped, any
   new issues found.
2. **Issues fixed** — table of `Issue #` from AUDIT-2 → `Status` →
   `File:line` → `One-line description`.
3. **New issues discovered** — anything you found that wasn't in the
   audits.
4. **Acceptance criteria evidence** — for each numbered criterion above,
   paste the actual command + output (truncated if long).
5. **Anything still stubbed** — be honest. List anything where a real
   implementation needs a credential or external setup you didn't have.
6. **Recommended next steps** — what should happen on the next pass.

Be honest. The previous "everything is done" claim was wrong. Don't repeat
it. If something isn't actually working, say so and tell me why.
