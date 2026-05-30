# CargoScan — Production Setup Guide

Everything you need to go from a fresh Render deploy to a live, revenue-ready platform.

---

## 1. Render Environment Variables

Go to **Render → cargoscan-api → Environment** and set each of these.  
Values marked 🔴 will break core functionality if missing.

### Core (set first)

| Variable | Value | Notes |
|----------|-------|-------|
| `FRONTEND_URL` 🔴 | `https://cargoscan-app-2026.web.app` | Or your custom domain |
| `API_PUBLIC_URL` 🔴 | `https://cargoscan-api.onrender.com` | Used in email links |
| `SUPER_ADMIN_PASSWORD_HASH` 🔴 | *(see §2 below)* | bcrypt hash of your admin password |

### Auth & Identity

| Variable | Where to get it |
|----------|-----------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` 🔴 | Firebase console → Project Settings → Service accounts → Generate new private key → copy the entire JSON string |

### Payments

| Variable | Where to get it |
|----------|-----------------|
| `PAYSTACK_SECRET_KEY` 🔴 | [Paystack dashboard](https://dashboard.paystack.com) → Settings → API Keys & Webhooks → Live Secret Key (starts with `sk_live_`) |
| `PAYSTACK_PUBLIC_KEY` | Same page → Live Public Key (starts with `pk_live_`) |

After setting the key, register the webhook in Paystack:
- Paystack → Settings → API Keys & Webhooks → Webhook URL:
  `https://cargoscan-api.onrender.com/api/billing/webhook`

### Email (SendGrid)

| Variable | Where to get it |
|----------|-----------------|
| `SENDGRID_API_KEY` 🔴 | [SendGrid](https://app.sendgrid.com) → Settings → API Keys → Create with **Mail Send** permission |

### WhatsApp (Meta Cloud API)

| Variable | Where to get it |
|----------|-----------------|
| `WHATSAPP_TOKEN` | [Meta Business Manager](https://business.facebook.com) → WhatsApp → API Setup → Temporary or Permanent Token |
| `WHATSAPP_PHONE_ID` | Same page → Phone number ID |

**Note:** Message templates must be approved before notifications send. Submit templates at:
Meta Business Manager → WhatsApp Manager → Message Templates

### Storage (Supabase)

| Variable | Where to get it |
|----------|-----------------|
| `SUPABASE_URL` | [Supabase](https://supabase.com) → Project → Settings → API → Project URL |
| `SUPABASE_KEY` | Same page → `anon` public key (or `service_role` for server-side uploads) |

### Error Tracking (Sentry)

| Variable | Where to get it |
|----------|-----------------|
| `SENTRY_DSN` | [Sentry](https://sentry.io) → Create project (Node.js) → DSN shown on project creation screen |

For frontend Sentry, add `VITE_SENTRY_DSN` to the Firebase Hosting build environment or to `.env.production`.

---

## 2. Generating the Super Admin Password Hash

Run this once locally (Node.js required):

```bash
node -e "
const bcrypt = require('./cargoscan-backend/node_modules/bcrypt');
bcrypt.hash('YOUR_CHOSEN_PASSWORD', 12).then(h => {
  console.log('Set this in Render as SUPER_ADMIN_PASSWORD_HASH:');
  console.log(h);
});
"
```

Paste the output (`$2b$12$...`) as the value of `SUPER_ADMIN_PASSWORD_HASH` in Render.  
`SUPER_ADMIN_EMAIL` is already set to `admin@cargoscan.app` in render.yaml.

---

## 3. Sentry Setup (step by step)

1. Go to [https://sentry.io/signup](https://sentry.io/signup) and create an account
2. Create a new project → Platform: **Node.js** → Name: `cargoscan-api`
3. Copy the DSN (looks like `https://abc123@o123456.ingest.sentry.io/123456`)
4. Set `SENTRY_DSN` in Render → `cargoscan-api` → Environment
5. For frontend: create a second project → Platform: **React**
6. Copy that DSN and set as `VITE_SENTRY_DSN` in `.env.production`, then redeploy:
   ```bash
   cd cargoscan-app && npm run build && firebase deploy --only hosting --project cargoscan-app-2026
   ```

---

## 4. Post-Setup Verification

After setting all Render env vars, **manually restart** `cargoscan-api` (Render → Manual Deploy or restart service) so it picks up the new values.

Then run these checks:

```bash
# 1. Health check
curl https://cargoscan-api.onrender.com/api/health
# Expected: {"status":"ok","checks":{"database":{"status":"ok"},"redis":{"status":"ok"}}}

# 2. Auth works
curl -X POST https://cargoscan-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cargoscan.app","password":"YOUR_PASSWORD"}'
# Expected: {"token":"...","user":{"role":"SUPER_ADMIN"}}

# 3. Rate limit on tracking (run 35 times)
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" https://cargoscan-api.onrender.com/api/tracking/FAKE; done
# Expected: 200 (×30) then 429 (×5)

# 4. Email sends (triggers password reset email)
curl -X POST https://cargoscan-api.onrender.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cargoscan.app"}'
# Expected: 200 (check inbox)
```

---

## 5. DNS (Custom Domain)

If using `app.cargoscan.app`:
- Firebase Hosting → Custom domain → add `app.cargoscan.app` → follow DNS verification steps

If using multi-tenant subdomains (`org-slug.cargoscan.app`):
- Add wildcard CNAME `*.cargoscan.app → cargoscan-api.onrender.com` at your DNS provider
- Render → `cargoscan-api` → Custom Domains → add `*.cargoscan.app`

---

## 6. Render Worker: cargoscan-notifications

The notifications worker runs separately. Verify it's live:
- Render → `cargoscan-notifications` → Status: **Live**
- Same env vars needed: `REDIS_URL`, `DATABASE_URL`, `SENDGRID_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`

These are already in `render.yaml` as `sync: false` — set them the same as in `cargoscan-api`.

---

## Rollback

```bash
# Soft rollback — revert last commit and push
git revert HEAD --no-edit && git push origin main

# Hard rollback — use Render dashboard
# Render → cargoscan-api → Deploys → click previous deploy → Redeploy
```
