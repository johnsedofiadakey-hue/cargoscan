# CargoScan — Complete Platform Guide

**Precision Freight Measurement SaaS · China–Ghana Corridor · Production Ready**

---

## Table of Contents

1. [Your Dev / Owner Login Credentials](#1-your-dev--owner-login-credentials)
2. [How the Login System Works](#2-how-the-login-system-works)
3. [What Happens When an Org Signs Up](#3-what-happens-when-an-org-signs-up)
4. [Platform Architecture](#4-platform-architecture)
5. [Full Feature Reference](#5-full-feature-reference)
6. [Super Admin Console — Full Control](#6-super-admin-console--full-control)
7. [Org Admin Dashboard](#7-org-admin-dashboard)
8. [Trial System — How It Works](#8-trial-system--how-it-works)
9. [Team Management & Invites](#9-team-management--invites)
10. [WhatsApp Notifications Setup](#10-whatsapp-notifications-setup)
11. [Paystack Billing Setup](#11-paystack-billing-setup)
12. [Backend Setup & Local Dev](#12-backend-setup--local-dev)
13. [iOS App Setup](#13-ios-app-setup)
14. [Environment Variables — Complete Reference](#14-environment-variables--complete-reference)
15. [Database Schema Summary](#15-database-schema-summary)
16. [API Reference](#16-api-reference)
17. [Pre-Production Checklist](#17-pre-production-checklist)
18. [Deployment Guide](#18-deployment-guide)
19. [Domain & DNS Setup](#19-domain--dns-setup)
20. [Monitoring & Maintenance](#20-monitoring--maintenance)
21. [Troubleshooting](#21-troubleshooting)
22. [All Test Credentials](#22-all-test-credentials)

---

## 1. Your Dev / Owner Login Credentials

These are the credentials for the **Platform Super Admin Console** — your private control panel. This email and password are **never shown** anywhere in the UI. Only you know it.

```
Email    →  admin@cargoscan.app
Password →  Cs#Platform2026!
```

> **Change this before going live.** Open `cargoscan-production.jsx` and find:
> ```js
> _sa: { email:"admin@cargoscan.app", pass:"Cs#Platform2026!", ... }
> ```
> Replace both values with your real credentials. In production, this check
> will be replaced by a real API call to your backend, not a hardcoded value.

### What you see when you log in as Super Admin

A completely different dashboard from all org users. Tabs:

| Tab | What you can do |
|-----|----------------|
| **Overview** | MRR, active orgs, items scanned, WhatsApp delivery rate |
| **Organizations** | Every company, their plan, usage, override any plan instantly |
| **Feature Flags** | Toggle WhatsApp, LiDAR, offline mode, Paystack, Stripe, maintenance mode |
| **Pricing** | Change all plan prices + trial limits + generate `.env` block |
| **Paystack** | API keys, test/live switch, webhook URL, test cards |
| **Plan Override** | Give any company a free pass, extend trial, change plan without payment |
| **System Health** | All services status, latency, uptime, quick actions |
| **WhatsApp Test** | Send any template to a real phone number live |
| **Audit Logs** | Full platform activity stream |

### Demo org accounts (for testing)

| Name | Email | Password | Role | Plan |
|------|-------|----------|------|------|
| John Mensah | `john@stormglide.com` | `Admin1234!` | ADMIN | BUSINESS |
| Ama Owusu | `ama@stormglide.com` | `Ama12345!` | SUPERVISOR | BUSINESS |
| James Asante | `james@stormglide.com` | `Ops12345!` | OPERATOR | BUSINESS |
| Eric Boateng | `eric@fastfreight.com` | `Eric1234!` | ADMIN | TRIAL (7d left) |
| Wei Zhang | `wei@guangzhou.com` | `WeiAdmin99!` | ADMIN | ENTERPRISE |

> These are demo accounts built into the frontend prototype. In production, all
> accounts are stored in PostgreSQL and authenticated via the backend API.

---

## 2. How the Login System Works

### Single Login Screen — Zero Hints

There is **one login URL for everyone**. No role selector. No company dropdown. No demo accounts shown. It looks like a standard professional sign-in form.

```
cargoscan.app/login
```

When someone types their email and password:

1. The system checks credentials against the database
2. Based on their role, they are **silently routed** to the right dashboard:

```
Super Admin email  →  Platform Console  (you only)
Org ADMIN          →  Full dashboard with billing, team, settings
Org SUPERVISOR     →  Dashboard, shipments, disputes, verify
Org OPERATOR       →  Dashboard, shipments, scan only
```

No visible clues. No error that says "this email isn't a super admin." A wrong password just shows: *"Incorrect email or password."*

### Multi-tenant Isolation

Every organisation gets:
- Their own **subdomain**: `companyname.cargoscan.app`
- Isolated data — one org can never see another's shipments, items, or users
- Isolated usage limits enforced per `organizationId` in every query

In production, the subdomain is read from the HTTP `Host` header:
```js
// backend/src/middleware/tenant.js
const slug = req.hostname.split('.')[0]; // "stormglide" from "stormglide.cargoscan.app"
const org = await prisma.organization.findUnique({ where: { slug } });
```

---

## 3. What Happens When an Org Signs Up

### The signup flow (step by step)

**Step 1 — Account details**
- Full name
- Work email
- Password (strength meter: Weak → Fair → Good → Strong)
- Confirm password

**Step 2 — Company setup**
- Company name → system generates a URL-safe slug live:
  - `"Stormglide Logistics"` → `stormglide-logistics`
  - `"FastFreight GH"` → `fastfreight-gh`
- Live preview: `stormglide-logistics.cargoscan.app` with "Available ✓" check
- Country, City
- Default CBM rate (pre-filled: $85 for China–Ghana)

**Step 3 — Success screen**
- Shows their exact portal URL, email, plan (TRIAL), role (ADMIN)
- Every field has a COPY button
- Warning to save their password

### What the system creates automatically

When signup completes, the backend runs a single database transaction:

```
1. Organization record
   - name: "Stormglide Logistics"
   - slug: "stormglide-logistics"
   - plan: TRIAL
   - planExpiresAt: now + 14 days
   - defaultCbmRate: 85
   - country, city, currency

2. User record
   - linked to the new org
   - role: ADMIN
   - email + bcrypt-hashed password

3. Default Warehouse record
   - name: "Accra Warehouse" (uses their city)
   - linked to the org

4. JWT tokens generated
   - accessToken (15 min expiry)
   - refreshToken (30 day expiry)

5. Welcome email triggered (non-blocking)
   - Subject: "Welcome to CargoScan — your first scan in 5 minutes"
   - Includes step-by-step setup instructions
   - Personalised with their name and company name

6. Onboarding email sequence scheduled
   - Day 0:  Welcome + first scan guide
   - Day 2:  "Did you scan your first item?" + video walkthrough
   - Day 5:  Feature spotlight — WhatsApp notifications
   - Day 10: Dispute prevention case study
   - Day 14: Trial ending — upgrade prompt with pricing
```

### Company personalisation

Every screen inside their dashboard shows their **real company name and subdomain**:

```
Topnav:    "Stormglide Logistics" · stormglide-logistics.cargoscan.app
Emails:    "Hello John, Stormglide Logistics is live on CargoScan"
WhatsApp:  Sent from their registered business number
Tracking:  https://track.cargoscan.app/DHL392029 → shows their company logo
Export:    Excel packing lists say "Stormglide Logistics" in the header
```

### Trial limits enforced automatically

| Limit | Trial | Starter | Business | Enterprise |
|-------|-------|---------|----------|------------|
| Users | 2 | 3 | 10 | Unlimited |
| Shipments/mo | 5 | 30 | 200 | Unlimited |
| Items | 50 | Unlimited | Unlimited | Unlimited |
| WhatsApp | ✗ | ✗ | ✓ | ✓ |
| Disputes | ✗ | ✗ | ✓ | ✓ |

Every API request checks the org's plan before allowing the operation. If they're at their limit, they get a `429 Too Many Requests` with a message prompting upgrade.

---

## 4. Platform Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│   Web App (React)    iOS App (SwiftUI)    Customer Portal       │
│   cargoscan.app      TestFlight           track.cargoscan.app   │
└────────────────────────────┬────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────▼────────────────────────────────────┐
│                    API LAYER (Node.js + Express)                  │
│   JWT Auth    Rate Limiting    Plan Enforcement    Webhooks      │
│   /api/auth   /api/items   /api/shipments   /api/billing        │
└──────┬──────────────────────────────────┬────────────────────────┘
       │                                  │
┌──────▼──────┐  ┌────────────┐  ┌───────▼──────────────────────┐
│ PostgreSQL  │  │   Redis    │  │     External Services        │
│ (Prisma)    │  │ Rate limit │  │  Paystack · WhatsApp · S3   │
│ Multi-tenant│  │ Session    │  │  SendGrid · Supabase Storage │
└─────────────┘  └────────────┘  └──────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React (JSX) | Single file, no build step needed for prototyping |
| Backend | Node.js + Express | Fast, familiar, huge ecosystem |
| ORM | Prisma | Type-safe, great migrations, auto-generated client |
| Database | PostgreSQL | ACID, JSON support, excellent with Prisma |
| Cache | Redis | Rate limiting + refresh token storage |
| Storage | Supabase Storage or AWS S3 | Cargo photos |
| Payments | Paystack (primary) + Stripe | Mobile money for Africa |
| WhatsApp | Meta Cloud API + Twilio fallback | Official, reliable |
| Email | Nodemailer / SendGrid | Transactional + onboarding sequences |
| iOS | SwiftUI + ARKit | Native LiDAR access |
| Deploy | Railway (API) + Vercel (frontend) | Zero-ops, auto-SSL |

---

## 5. Full Feature Reference

### Cargo Measurement

| Feature | Detail |
|---------|--------|
| **LiDAR Scanning** | iPhone 12 Pro+, ARKit, 30,000 depth points/sec, ±0.5–1.5cm |
| **Confidence Score** | Green ≥95%, Yellow 80–94%, Red <80%, auto-lock at 97% |
| **CBM Formula** | `(L × W × H) / 1,000,000 × quantity` |
| **Cost Formula** | `CBM × defaultCbmRate` |
| **Manual Entry** | Fallback for non-LiDAR devices or override |
| **Photo Capture** | Multiple photos per item, stored in Supabase/S3 |
| **Damage Flag** | Toggle → auto WhatsApp alert to customer |
| **Offline Mode** | Queue scans locally → sync when reconnected |

### Shipments

| Feature | Detail |
|---------|--------|
| **Container Types** | 20ft (28 CBM), 40ft (55.8 CBM), 40ft HC (67.2 CBM), LCL |
| **Status Flow** | OPEN → LOADING → SEALED → IN_TRANSIT → ARRIVED → DELIVERED |
| **Fill Tracker** | Live CBM fill % with visual bar, warning at 90% |
| **Packing List Export** | 3-sheet Excel: full list, customer summary, damaged items |
| **Bulk WhatsApp** | Status change → auto-notify all customers in shipment |

### Disputes

| Feature | Detail |
|---------|--------|
| **Auto-detection** | Compare origin vs destination scan — auto-open dispute if >10% diff |
| **Auto-approve** | <5% diff → auto-verified |
| **Review queue** | 5–10% diff → supervisor review required |
| **Photo evidence** | Both scans have timestamped photos, permanently linked |
| **Resolution log** | Every action logged with user, timestamp, notes |

---

## 6. Super Admin Console — Full Control

Login with your owner credentials. You get 9 tabs:

### Overview Tab
Real-time platform metrics:
- MRR, ARR, active orgs, churn rate
- Items scanned (30d), WhatsApp delivery rate
- Plan distribution with revenue breakdown per tier
- Key metrics: avg LTV, trial→paid conversion, open disputes

### Organizations Tab
Full table of all companies. For each:
- Company name, portal URL (slug.cargoscan.app)
- Current plan, user count, shipment count
- Monthly revenue contribution
- "Override" button to change their plan instantly

### Feature Flags Tab
Toggle any feature globally. Changes are immediate:
- WhatsApp notifications, bulk notify, damage alerts
- LiDAR scanning, manual entry, auto-lock at 97%
- Offline mode, dispute system, tracking portal
- Paystack payments, Stripe payments, annual billing
- New org onboarding emails
- **Maintenance mode** — shows maintenance page to ALL users (protected with confirmation dialog)

### Pricing Tab
Change all plan prices and trial limits:
- Trial: days, max users, max shipments, max items
- Starter / Business / Enterprise: monthly + annual prices
- Paystack plan codes (test + live)
- **Generates an `.env` block** — copy and paste into your server

### Paystack Tab
- Switch between Test and Live mode (Live shows a red warning)
- Save API keys (Secret + Public + Webhook secret)
- Webhook URL to copy into Paystack dashboard
- All required webhook events listed
- Test card numbers for Paystack sandbox

### Plan Override Tab
Bypass Paystack for any org:
- Select org from dropdown
- Pick new plan (TRIAL / STARTER / BUSINESS / ENTERPRISE)
- Set duration in days
- Enter reason (logged in audit trail)
- Every override is recorded

### System Health Tab
- Status of all services: API, PostgreSQL, Redis, Paystack, WhatsApp, Storage, Email
- Performance: latency, requests/min, error rate, uptime, DB pool, memory, CPU
- Quick actions: restart API, clear Redis cache, run migrations, force WhatsApp retry, export error logs

### WhatsApp Test Tab
Send a live test message to any phone number:
- Choose template: cargo_received, damage_detected, shipment_departed, port_arrival, dispute_opened
- Enter phone (no + prefix), customer name, tracking number
- See live message preview before sending
- Useful for verifying Meta API credentials are working

### Audit Logs Tab
Full activity stream: every API call, webhook event, plan override, feature flag change, login.

---

## 7. Org Admin Dashboard

When an org ADMIN logs in, they see tabs based on their plan:

| Tab | Who sees it | What it does |
|-----|-------------|--------------|
| Dashboard | All roles | Stats, trial usage bars, recent shipments |
| Shipments | All roles | Full table with filter, create, export |
| Scan Item | All roles | LiDAR scanner prompt + manual CBM calculator |
| Disputes | Admin + Supervisor | Dispute table with review + resolve |
| Team | Admin only | Invite workers, manage roles, deactivate |
| Billing | Admin only | Current plan, usage, upgrade flow |
| Settings | Admin only | Company name, CBM rate, city |

### Dashboard shows their company name and subdomain everywhere:

```
Header:    "Stormglide Logistics  ·  stormglide-logistics.cargoscan.app  ·  BUSINESS"
Welcome:   "Good morning, John 👋  Here's what's happening at Stormglide Logistics"
```

---

## 8. Trial System — How It Works

### When trial starts
- `plan: TRIAL`, `planExpiresAt: now + 14 days` set at signup
- All limits active immediately

### Trial countdown banner
Shows on every page until upgraded:
- **>3 days left**: amber banner — "9 days left in your free trial"
- **≤3 days left**: red pulsing banner — "2 days left — upgrade now to avoid losing access"
- Upgrade button visible at all times

### Usage bars on Dashboard
Live bars showing:
- Shipments used / limit (e.g., 3/5)
- Items scanned / limit (e.g., 41/50)
- Team members / limit (e.g., 2/2)

Bar turns amber at 70%, red at 90%.

### When limits are hit
- **Users at limit**: Invite button changes to "Upgrade to Add More Users"
- **Shipments at limit**: Create shipment returns `429` with upgrade prompt
- **Items at limit**: Scan returns `429` with upgrade prompt

### When trial expires
User lands on the paywall screen instead of their dashboard. All their data is preserved. They must upgrade to continue.

### Upgrading
Admin clicks "Upgrade Now" → plan selection modal:
- Starter $29/mo, Business $79/mo, Enterprise $199/mo
- Click → Paystack checkout opens (mobile money + cards)
- Payment confirmed → Paystack webhook → plan activated → dashboard unlocked

---

## 9. Team Management & Invites

### How admin creates an account for a worker

1. Go to **Team** tab
2. Click **+ Invite Team Member**
3. Fill in: full name, work email, role (Operator / Supervisor / Admin)
4. Click **Create Account**
5. System creates the account with a **temporary password**
6. A credentials box appears:

```
Login URL:          stormglide-logistics.cargoscan.app
Email:              worker@stormglide.com
Temporary Password: TempAB12XY!
Role:               OPERATOR
```

Each field has a **COPY** button. Admin shares credentials with the worker. Worker logs in and can change their password.

### Role permissions matrix

| Feature | Admin | Supervisor | Operator |
|---------|-------|-----------|----------|
| Scan & create items | ✓ | ✓ | ✓ |
| View shipments | ✓ | ✓ | ✓ |
| Create shipments | ✓ | ✓ | ✗ |
| Verify items | ✓ | ✓ | ✗ |
| Resolve disputes | ✓ | ✓ | ✗ |
| Manage team | ✓ | ✗ | ✗ |
| Billing & upgrade | ✓ | ✗ | ✗ |
| Export packing list | ✓ | ✓ | ✗ |
| Company settings | ✓ | ✗ | ✗ |

---

## 10. WhatsApp Notifications Setup

### Step 1 — Meta Business Account
1. Go to [business.facebook.com](https://business.facebook.com)
2. Create a Business Account
3. Complete business verification (takes 1–3 days, need business registration)

### Step 2 — WhatsApp Business API
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create App → Business → Add WhatsApp product
3. Get your **Phone Number ID** and **WhatsApp Business Account ID**
4. Generate a **permanent access token** (System User → Generate Token)

### Step 3 — Register your phone number
1. In Meta Business Suite → WhatsApp → Phone Numbers
2. Add a new number (can be a virtual number)
3. Verify via OTP

### Step 4 — Create message templates (REQUIRED by Meta)
You must pre-approve templates before sending. Create these 5:

**Template 1: cargo_received**
```
📦 CargoScan Notification

Hello {{1}},

Your cargo has been received and scanned at the origin warehouse.

Tracking: {{2}}
Dimensions: {{3}} cm
CBM: {{4}}
Shipping cost: ${{5}}

Track your package:
https://track.cargoscan.app/{{2}}

CargoScan — Precision Freight
```

**Template 2: damage_detected**
```
⚠️ Damage Alert

Hello {{1}},

Item {{2}} was flagged with potential damage at the warehouse. Photos have been recorded as evidence.

View photos and report:
https://track.cargoscan.app/{{2}}

If you have questions, contact your freight agent.
```

**Template 3: shipment_departed**
```
🚢 Your Shipment Has Departed

Hello {{1}},

Shipment {{2}} has departed {{3}} and is on its way to {{4}}.

Estimated arrival: {{5}} days

Track live:
https://track.cargoscan.app/{{2}}
```

**Template 4: port_arrival**
```
🏭 Cargo Arrived at Port

Hello {{1}},

Your cargo {{2}} has arrived at {{3}} and is in customs clearance.

Expected clearance: {{4}}

Track status:
https://track.cargoscan.app/{{2}}
```

**Template 5: dispute_opened**
```
🛡 Measurement Review Notice

Hello {{1}},

A measurement review has been opened for item {{2}}. Our team is comparing the origin and destination scans.

We will contact you within 24 hours with the outcome.

View details:
https://track.cargoscan.app/{{2}}
```

### Step 5 — Add to .env
```bash
WHATSAPP_PROVIDER=meta
WHATSAPP_TOKEN=your_permanent_access_token_here
WHATSAPP_PHONE_ID=12345678901234
WHATSAPP_BUSINESS_ID=98765432109876
```

### Step 6 — Test in Super Admin Console
1. Go to Super Admin → WhatsApp Test tab
2. Select template → enter your phone (no + prefix) → click Send
3. You should receive the message within 5 seconds

### Fallback: Twilio WhatsApp
If Meta approval is slow, use Twilio:
```bash
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## 11. Paystack Billing Setup

### Step 1 — Create Paystack account
1. Go to [paystack.com](https://paystack.com)
2. Sign up with your business email
3. Complete business verification (Ghana business registration or individual)

### Step 2 — Get your API keys
1. Dashboard → Settings → API Keys & Webhooks
2. Copy **Secret Key** (`sk_test_xxx` for test, `sk_xxx` for live)
3. Copy **Public Key** (`pk_test_xxx` or `pk_live_xxx`)

### Step 3 — Create subscription plans
1. Dashboard → Products → Plans → Create Plan
2. Create 3 plans:

| Plan | Amount | Currency | Interval |
|------|--------|----------|----------|
| CargoScan Starter | 29 | USD | monthly |
| CargoScan Business | 79 | USD | monthly |
| CargoScan Enterprise | 199 | USD | monthly |

3. After creating each, copy the **Plan Code** (starts with `PLN_`)

### Step 4 — Set up webhook
1. Settings → API Keys & Webhooks → Webhooks
2. Add webhook URL:
   ```
   https://api.cargoscan.app/api/billing/paystack/webhook
   ```
3. Enable these events:
   - `charge.success`
   - `subscription.create`
   - `subscription.disable`
   - `subscription.not_renew`
   - `invoice.create`
   - `invoice.payment_failed`

### Step 5 — Add to .env
```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_STARTER_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx
PAYSTACK_BUSINESS_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx
PAYSTACK_ENTERPRISE_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx
```

### Step 6 — Test payment flow
Use these test card details:
```
Card number:  4084 0840 8408 4081
CVV:          408
Expiry:       12/30
OTP:          123456
```

For declined: `4084 8488 4084 8488`

### Step 7 — Go live
1. Replace `sk_test_` with `sk_` and `pk_test_` with `pk_`
2. Create live plans in Paystack (same steps, live dashboard)
3. Update plan codes in .env
4. In Super Admin → Paystack tab → switch to Live mode

---

## 12. Backend Setup & Local Dev

### Prerequisites
- Node.js v20+
- PostgreSQL 14+ (or Docker)
- Redis 7+ (or Docker)

### 1. Install dependencies
```bash
cd cargoscan-backend
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your values (see Section 14 for full reference)
```

### 3. Start database with Docker
```bash
docker-compose up -d postgres redis
```

Or point `DATABASE_URL` at your existing PostgreSQL instance.

### 4. Run migrations
```bash
npx prisma migrate dev --name init
```

### 5. Seed demo data
```bash
node prisma/seed.js
```

This creates:
- Organisation: Stormglide Logistics
- Admin user: john@stormglide.com / Admin1234!
- Operator: james@stormglide.com / Operator123!
- Sample warehouse in Accra
- Shipment SHP-2026-001 with 4 cargo items

### 6. Start the server
```bash
npm run dev
# Server runs at http://localhost:3000
```

### 7. Verify it's working
```bash
curl http://localhost:3000/health
# Response: {"status":"ok","db":"connected","redis":"connected"}
```

---

## 13. iOS App Setup

### Prerequisites
- Mac with Xcode 15+
- Apple Developer account (free for TestFlight, $99/yr for App Store)
- iPhone 12 Pro or newer (for LiDAR)

### 1. Open the project
```bash
cd cargoscan-ios
open CargoScan.xcodeproj
```

### 2. Update API base URL
In `Services/CargoScanAPI.swift`:
```swift
let BASE_URL = "https://api.cargoscan.app"  // your deployed API
```

### 3. Set bundle ID
In Xcode → project settings → Bundle Identifier:
```
app.cargoscan.ios
```

### 4. Sign and build
1. Select your Apple Developer team in Signing & Capabilities
2. Build for your device: Cmd+R
3. For TestFlight: Product → Archive → Distribute

### 5. TestFlight distribution
1. Archive the app
2. Upload to App Store Connect
3. Add testers via TestFlight
4. Share the TestFlight link with your warehouse operators

---

## 14. Environment Variables — Complete Reference

```bash
# ── DATABASE ──────────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/cargoscan_db"

# ── SERVER ────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production                  # development | production
FRONTEND_URL=https://app.cargoscan.app

# ── JWT AUTH ──────────────────────────────────────────────────
JWT_SECRET=minimum_32_character_secret_here_make_it_random
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=different_32_char_secret_for_refresh_tokens
JWT_REFRESH_EXPIRES_IN=30d

# ── STORAGE ───────────────────────────────────────────────────
STORAGE_PROVIDER=supabase            # supabase | s3
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
STORAGE_BUCKET=cargoscan-photos

# AWS S3 (if using S3 instead of Supabase)
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx
# AWS_REGION=eu-west-1
# S3_BUCKET=cargoscan-photos

# ── WHATSAPP ──────────────────────────────────────────────────
WHATSAPP_PROVIDER=meta               # meta | twilio
WHATSAPP_TOKEN=your_meta_access_token
WHATSAPP_PHONE_ID=12345678901234
WHATSAPP_BUSINESS_ID=98765432109876

# Twilio fallback
# TWILIO_ACCOUNT_SID=ACxxx
# TWILIO_AUTH_TOKEN=xxx
# TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# ── PAYSTACK ──────────────────────────────────────────────────
PAYSTACK_SECRET_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_STARTER_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx
PAYSTACK_BUSINESS_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx
PAYSTACK_ENTERPRISE_PLAN_CODE=PLN_xxxxxxxxxxxxxxxxxx

# ── STRIPE (optional, for non-Africa customers) ───────────────
# STRIPE_SECRET_KEY=sk_xxx
# STRIPE_WEBHOOK_SECRET=whsec_xxx
# STRIPE_STARTER_PRICE_ID=price_xxx
# STRIPE_BUSINESS_PRICE_ID=price_xxx
# STRIPE_ENTERPRISE_PRICE_ID=price_xxx

# ── EMAIL ─────────────────────────────────────────────────────
EMAIL_PROVIDER=sendgrid              # smtp | sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxx
EMAIL_FROM="CargoScan <noreply@cargoscan.app>"

# SMTP alternative
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=noreply@yourcompany.com
# SMTP_PASS=your_app_password

# ── REDIS ─────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── PLAN LIMITS (override defaults) ──────────────────────────
PLAN_TRIAL_DAYS=14
PLAN_TRIAL_USERS=2
PLAN_TRIAL_SHIPMENTS=5
PLAN_TRIAL_ITEMS=50
PLAN_STARTER_PRICE=29
PLAN_BUSINESS_PRICE=79
PLAN_ENTERPRISE_PRICE=199

# ── SUPER ADMIN ───────────────────────────────────────────────
# This key is used for the backend admin API endpoints
# Different from the frontend login — this protects /api/admin/*
SUPER_ADMIN_KEY=your_very_long_random_admin_api_key_here

# ── MONITORING (optional) ─────────────────────────────────────
# SENTRY_DSN=https://xxx@sentry.io/xxx
# LOGTAIL_SOURCE_TOKEN=xxx
```

---

## 15. Database Schema Summary

12 models in PostgreSQL via Prisma:

| Model | Purpose |
|-------|---------|
| **Organization** | Multi-tenant root. Every record scoped by `organizationId` |
| **User** | Org members. Roles: ADMIN, SUPERVISOR, OPERATOR |
| **Warehouse** | Physical scan locations |
| **Shipment** | Container grouping items. Status flow |
| **CargoItem** | Individual package. LiDAR data, photos, CBM, cost |
| **Dispute** | CBM mismatch or damage claim. Origin vs destination |
| **Subscription** | Payment records. Paystack reference codes |
| **NotificationLog** | Every WhatsApp/SMS/email sent |
| **SyncQueue** | Offline scan queue, synced when reconnected |
| **AuditLog** | Full action history per org |

---

## 16. API Reference

All endpoints require `Authorization: Bearer <accessToken>` except `/api/auth/*` and `/api/billing/paystack/plans`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create org + admin user |
| POST | `/api/auth/login` | Login → returns JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Set new password |

### Items
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/items` | List all items for org |
| POST | `/api/items` | Create item (scan result) |
| GET | `/api/items/:id` | Get item with photos + dispute |
| PATCH | `/api/items/:id` | Update item |
| POST | `/api/items/:id/verify` | Destination verification scan |
| POST | `/api/items/:id/photo` | Upload photo |

### Shipments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shipments` | List shipments |
| POST | `/api/shipments` | Create shipment |
| GET | `/api/shipments/:id` | Shipment + all items |
| PATCH | `/api/shipments/:id/status` | Change status (triggers WhatsApp) |
| GET | `/api/shipments/:id/export` | Download Excel packing list |

### Billing (Paystack)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/billing/paystack/plans` | Public — plan pricing |
| POST | `/api/billing/paystack/checkout` | Init Paystack transaction |
| GET | `/api/billing/paystack/verify/:ref` | Verify payment |
| POST | `/api/billing/paystack/webhook` | Paystack webhook handler |
| POST | `/api/billing/paystack/cancel` | Cancel subscription |
| GET | `/api/billing/paystack/manage` | Get Paystack management link |

### Organisation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/organisations/me` | Get current org details |
| PATCH | `/api/organisations/me` | Update org settings |
| GET | `/api/organisations/users` | List team members |
| POST | `/api/organisations/users` | Invite team member |
| PATCH | `/api/organisations/users/:id` | Update user role/status |

### Admin (Super Admin only — requires X-Admin-Key header)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Platform-wide stats |
| PATCH | `/api/admin/orgs/:id/plan` | Override org plan |
| POST | `/api/admin/flags` | Update feature flags |

---

## 17. Pre-Production Checklist

Work through this list before you point your domain at the server.

### 🔐 Security
- [ ] Change super admin email + password from defaults
- [ ] Generate strong JWT secrets (`openssl rand -hex 64`)
- [ ] Set `NODE_ENV=production` — disables stack traces in API responses
- [ ] Enable HTTPS only (Railway and Vercel do this automatically)
- [ ] Set `CORS` to only allow your frontend domain
- [ ] Enable rate limiting (Redis is in docker-compose — wire it up)
- [ ] Enable Helmet.js for security headers
- [ ] Rotate all dev/test API keys with production keys

### 💳 Payments
- [ ] Create live Paystack plans and copy plan codes
- [ ] Switch Paystack API keys from test to live
- [ ] Test a real payment with a real card
- [ ] Confirm webhook is receiving events in Paystack dashboard
- [ ] Test the subscription cancel flow

### 💬 WhatsApp
- [ ] Get Meta Business Account verified
- [ ] Register your phone number
- [ ] Submit all 5 templates for approval (takes 1–2 days)
- [ ] Send a live test message via Super Admin → WhatsApp Test
- [ ] Confirm delivery rate in Meta Business Suite

### 📧 Email
- [ ] Set up SendGrid (free tier: 100 emails/day)
- [ ] Verify your sending domain (SPF + DKIM records)
- [ ] Test welcome email by signing up with a real email
- [ ] Test all 5 onboarding emails

### 🗄 Database
- [ ] Run `npx prisma migrate deploy` on production database
- [ ] Do NOT run seed.js on production (demo data only)
- [ ] Set up automated backups (Railway does daily backups automatically)
- [ ] Test a restore from backup

### 📱 iOS App
- [ ] Update `BASE_URL` to production API URL
- [ ] Test LiDAR scanning on a real iPhone 12 Pro+
- [ ] Build and upload to TestFlight
- [ ] Send TestFlight invites to your first warehouse operators

### 🌐 Domain & DNS
- [ ] Point `api.cargoscan.app` at your API server
- [ ] Point `app.cargoscan.app` at your frontend
- [ ] Add wildcard DNS `*.cargoscan.app` for org subdomains
- [ ] Test that `stormglide.cargoscan.app` resolves correctly
- [ ] Confirm SSL certificates are issued

### 📊 Monitoring
- [ ] Set up Sentry for error tracking (free tier available)
- [ ] Set up UptimeRobot for uptime monitoring (free)
- [ ] Test that you get an alert when the API goes down
- [ ] Add `SENTRY_DSN` to production environment

---

## 18. Deployment Guide

### Recommended Stack (zero-ops)

| Service | What | Cost |
|---------|------|------|
| **Railway** | API + PostgreSQL + Redis | ~$15–20/mo |
| **Vercel** | React frontend | Free |
| **Supabase** | Photo storage | Free up to 1GB |
| **SendGrid** | Email | Free up to 100/day |
| **Paystack** | Payments | 1.5% + ₵0.5 per transaction |
| **Meta** | WhatsApp API | ~$0.005 per conversation |
| **Sentry** | Error tracking | Free |
| **UptimeRobot** | Monitoring | Free |

**Estimated monthly cost to run: ~$20–35** until you have significant traffic.

---

### Deploy API to Railway

**One-time setup:**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd cargoscan-backend
railway init
railway up
```

**Or via GitHub (recommended):**

1. Push your backend to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo → Railway auto-detects Node.js
4. Add environment variables (Settings → Variables)
5. Click Deploy

**Add PostgreSQL and Redis on Railway:**
1. In your Railway project → New → Database → PostgreSQL
2. In your Railway project → New → Database → Redis
3. Railway automatically sets `DATABASE_URL` and `REDIS_URL` for you

**Run migrations:**
```bash
railway run npx prisma migrate deploy
```

**Your API will be live at:**
```
https://cargoscan-api.up.railway.app
```

Then add a custom domain: Settings → Domains → `api.cargoscan.app`

---

### Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (from the frontend directory)
vercel --prod
```

**Or via GitHub:**
1. Push frontend to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Framework: Create React App (or Vite)
4. Add environment variable: `VITE_API_URL=https://api.cargoscan.app`
5. Deploy

**Custom domain:**
Vercel dashboard → Domains → Add `app.cargoscan.app`

---

### Deploy with Docker (for VPS/dedicated server)

```bash
# Build and start everything
docker-compose up -d

# Check containers are running
docker-compose ps

# Run migrations
docker-compose exec api npx prisma migrate deploy

# View logs
docker-compose logs -f api
```

The `docker-compose.yml` starts:
- `api` — Node.js API on port 3000
- `postgres` — PostgreSQL 16 on port 5432
- `redis` — Redis 7 on port 6379
- `pgadmin` — Database UI on port 5050

For VPS, add Nginx as reverse proxy:
```nginx
server {
    listen 443 ssl;
    server_name api.cargoscan.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

### CI/CD with GitHub Actions

The `.github/workflows/deploy.yml` file:
1. Runs on every push to `main`
2. Runs tests (`npm test`)
3. Runs Prisma migrations
4. Deploys to Railway
5. Sends Slack notification on success/fail

Required GitHub secrets:
```
RAILWAY_TOKEN          — from Railway dashboard → Settings → Tokens
DATABASE_URL           — your production DB URL
JWT_SECRET             — production JWT secret
PAYSTACK_SECRET_KEY    — live Paystack key
```

---

## 19. Domain & DNS Setup

### Records to create at your domain registrar

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A or CNAME | `api` | Railway IP or CNAME | 300 |
| A or CNAME | `app` | Vercel CNAME | 300 |
| A or CNAME | `track` | Vercel CNAME (tracking portal) | 300 |
| A or CNAME | `*` | Railway IP or CNAME | 300 |

The **wildcard `*`** record is critical — it makes `stormglide.cargoscan.app`, `fastfreight.cargoscan.app`, and any future org subdomain resolve automatically.

### How subdomain routing works

In production, the API reads the `Host` header to identify the org:

```js
// Every authenticated request
const hostname = req.hostname;           // "stormglide.cargoscan.app"
const slug = hostname.split('.')[0];     // "stormglide"
const org = await prisma.organization.findUnique({ where: { slug } });
```

The frontend reads it the same way:
```js
const slug = window.location.hostname.split('.')[0];
const apiBase = `https://api.cargoscan.app`;  // API is centralised
// All API calls include the org token which identifies the tenant
```

---

## 20. Monitoring & Maintenance

### Sentry (error tracking)
```bash
npm install @sentry/node
```

```js
// src/index.js
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
```

You'll get an email every time an unhandled error occurs in production.

### UptimeRobot (free uptime monitor)
1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor → HTTPS → `https://api.cargoscan.app/health`
3. Set check interval: 5 minutes
4. Add your email for alerts

### Monthly maintenance tasks
- Check Paystack dashboard for failed payments
- Review Sentry for recurring errors
- Check WhatsApp token expiry (permanent tokens don't expire, but verify)
- Review audit logs for unusual activity
- Run `npx prisma migrate deploy` if there are new migrations

### Database backups
Railway takes automatic daily backups. For manual backup:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## 21. Troubleshooting

### "Cannot connect to database"
```bash
# Test connection
npx prisma db pull

# Check DATABASE_URL format:
# postgresql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
```

### "JWT invalid" errors
- Check `JWT_SECRET` is the same in all instances
- Tokens expire in 15 minutes — the frontend must use the refresh endpoint
- Check server time is correct (clock drift invalidates JWTs)

### Paystack webhook not firing
1. Check the webhook URL is exactly: `https://api.cargoscan.app/api/billing/paystack/webhook`
2. Check all 6 events are enabled in Paystack dashboard
3. Check server logs: `railway logs --tail`
4. Test webhook manually: Paystack dashboard → Webhooks → Test

### WhatsApp messages not delivering
1. Check token is valid: `curl -H "Authorization: Bearer TOKEN" https://graph.facebook.com/v17.0/me`
2. Check phone number format: must include country code, no + prefix: `233244556677`
3. Check template is approved in Meta Business Suite
4. Check recipient has WhatsApp installed

### Trial not expiring
The trial expiry is checked on every request in `auth.js` middleware:
```js
if (org.plan === "TRIAL" && org.planExpiresAt < new Date()) {
  return res.status(402).json({ error: "trial_expired", upgradeUrl: "/billing/upgrade" });
}
```
If it's not triggering, check `planExpiresAt` is set correctly in the database.

### "Slug already taken" on signup
The system appends a timestamp to make slugs unique:
```js
const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;
// "fastfreight" → "fastfreight-1741234567890"
```
This is expected behaviour. The company name stays the same; only the slug changes.

---

## 22. All Test Credentials

### Platform Owner (Super Admin)
```
Email:     admin@cargoscan.app
Password:  Cs#Platform2026!
Access:    Platform Console — full control over all orgs
```
> ⚠️ Change this before going live.

### Demo Org — Stormglide Logistics (BUSINESS plan)
```
Portal:    stormglide.cargoscan.app
Admin:     john@stormglide.com    /  Admin1234!
Supervisor: ama@stormglide.com    /  Ama12345!
Operator:  james@stormglide.com   /  Ops12345!
```

### Demo Org — FastFreight GH (TRIAL — 7 days left)
```
Portal:    fastfreight.cargoscan.app
Admin:     eric@fastfreight.com   /  Eric1234!
```

### Demo Org — Guangzhou Premier (ENTERPRISE)
```
Portal:    guangzhou-premier.cargoscan.app
Admin:     wei@guangzhou.com      /  WeiAdmin99!
```

### Paystack Test Cards
```
Success:   4084 0840 8408 4081  |  CVV: 408  |  Exp: 12/30  |  OTP: 123456
Declined:  4084 8488 4084 8488  |  CVV: 408  |  Exp: 12/30
```

### Backend Admin API (for /api/admin/* endpoints)
```
Header:    X-Admin-Key: dev_admin_key_replace_in_production
```
> This is separate from the frontend super admin login.
> Change `SUPER_ADMIN_KEY` in .env before going live.

### Sample Tracking Numbers
```
DHL392029  —  In Transit (Guangzhou → Tema)
FDX119920  —  Arrived with damage flag
UPS881122  —  Delivered
```

---

## Summary — What Needs to Happen Before Go-Live

| Priority | Task | Time |
|----------|------|------|
| 🔴 Critical | Change super admin credentials | 5 min |
| 🔴 Critical | Generate production JWT secrets | 5 min |
| 🔴 Critical | Set up PostgreSQL on Railway | 15 min |
| 🔴 Critical | Run Prisma migrations on production | 5 min |
| 🔴 Critical | Set up Paystack live keys + plan codes | 30 min |
| 🔴 Critical | Set up wildcard DNS `*.cargoscan.app` | 15 min |
| 🟡 Important | Get WhatsApp templates approved by Meta | 1–3 days |
| 🟡 Important | Set up SendGrid for transactional email | 30 min |
| 🟡 Important | Set up Supabase storage bucket | 15 min |
| 🟡 Important | Deploy iOS app to TestFlight | 1 hr |
| 🟡 Important | Set up Sentry for error tracking | 15 min |
| 🟢 Nice to have | Set up UptimeRobot monitoring | 10 min |
| 🟢 Nice to have | Enable annual billing plans in Paystack | 30 min |
| 🟢 Nice to have | Wire Stripe for non-African customers | 2 hrs |

**Realistic time to production-ready: 1–2 working days** (most of which is waiting for WhatsApp template approval).

---

*CargoScan — Built for the China–Ghana freight corridor · Expand to Nigeria, Kenya, South Africa*
