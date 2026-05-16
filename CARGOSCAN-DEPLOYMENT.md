# CargoScan Deployment Guide

This repo is configured for the pilot deployment shape:

- Backend API: Render web service
- Database: Render Postgres
- Redis-compatible store: Render Key Value
- Web app: Firebase Hosting
- Scan photos: local Render disk for smoke tests, Supabase Storage later for production durability

## 1. Create Render Resources

1. Create or log in to a Render account.
2. Connect GitHub to Render and grant access to the `cargoscan` repo.
3. In Render, choose **New > Blueprint**.
4. Select this repo.
5. Use the root blueprint file: `render.yaml`.
6. Review the resources:
   - `cargoscan-api`
   - `cargoscan-postgres`
   - `cargoscan-redis`
7. Enter secret values when Render prompts for `sync: false` environment variables.

Render will run:

```sh
npm ci && npm run build && npx prisma migrate deploy
npm start
```

The health check is:

```txt
/api/health
```

## 2. Required Render Environment Values

Render fills these automatically from the blueprint:

- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `SUPER_ADMIN_KEY`

You must provide these:

- `SUPER_ADMIN_PASSWORD_HASH`
- `API_PUBLIC_URL`
- `FRONTEND_URL`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `SENDGRID_API_KEY`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_ID`
- `OPENAI_API_KEY` if you want AI-assisted scan quality checks
- `CONTAINER_TRACKING_API_KEY` later, if Enterprise live container tracking is connected to a provider
- `FIREBASE_SERVICE_ACCOUNT_JSON` for Google sign-in token verification on the backend

For the first deploy, optional provider secrets can be left blank if you only need logged/skipped notifications. The blueprint defaults `STORAGE_PROVIDER=local`, so Supabase is not required for the first smoke test. Set `API_PUBLIC_URL` to the Render API URL, for example:

```txt
https://cargoscan-api.onrender.com
```

Set `FRONTEND_URL` after Firebase Hosting is live.

## 3. Generate Super Admin Password Hash

From `cargoscan-backend`:

```sh
node -e "require('bcrypt').hash('your-strong-password', 10).then(console.log)"
```

Paste the output into Render as `SUPER_ADMIN_PASSWORD_HASH`.

## 4. Deploy Firebase Web App

From `cargoscan-app`, build with the deployed Render API URL:

```sh
VITE_API_URL=https://cargoscan-api.onrender.com/api npm run build
```

Then deploy from the repo root using the root `firebase.json`:

```sh
firebase deploy --only hosting
```

After Firebase gives you the web URL, update Render:

```txt
FRONTEND_URL=https://your-firebase-site.web.app
```

Then redeploy `cargoscan-api`.

## 5. Smoke Test

After both services are live:

1. Open the Firebase URL.
2. Create a pilot organization.
3. Create a shipment.
4. Create a customer.
5. Create a cargo item.
6. Save a manual scan.
7. Open `/tracking/<shipment-code>`.
8. Check Render logs for skipped/sent notification logs.
9. Check `/api/health` on the Render API.

## Notes

- The blueprint uses free Render plans for the first smoke test.
- Free Render services can sleep, restart, or have limited persistence. Upgrade before a real customer pilot.
- Local uploaded photos on Render are not durable across restarts. Switch to Supabase Storage before relying on photo evidence.
- Do not run `prisma/seed.js` against production unless you intentionally want demo data.
