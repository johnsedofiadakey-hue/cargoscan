# CargoScan Deployment Guide

This repo is configured for the pilot deployment shape:

- Backend API: Render web service
- Database: Render Postgres
- Redis-compatible store: Render Key Value
- Web app: Firebase Hosting
- Scan photos: Supabase Storage bucket named `cargoscan-photos`

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
npm ci && npm run build
npx prisma migrate deploy
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
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `SENDGRID_API_KEY`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_ID`

For the first deploy, optional provider secrets can be left blank if you only need logged/skipped notifications. Set `API_PUBLIC_URL` to the Render API URL, for example:

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

- The blueprint uses paid pilot-sized Render plans: `starter` web/key-value and `basic-256mb` Postgres.
- To reduce cost during setup, change plans in `render.yaml` before creating the Blueprint.
- Do not run `prisma/seed.js` against production unless you intentionally want demo data.
