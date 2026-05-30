# CargoScan — Freight Intelligence Dashboard

React 19 + Vite 7 frontend for the CargoScan platform. Deploys to Firebase Hosting.

## Stack

- **React 19** + React Router 7
- **Vite 7** — build tool
- **Firebase Hosting** — static hosting + SPA rewrites
- **Firebase Auth** — Google OAuth (via popup)
- **Sentry** — frontend error tracking (optional)

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in your local values
npm run dev                   # http://localhost:5173
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API base URL (no trailing slash) |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |
| `VITE_IOS_TESTFLIGHT_URL` | No | TestFlight URL shown as QR in Mobile App tab |
| `VITE_SENTRY_DSN` | No | Sentry DSN for error tracking |

`.env.production` is committed and sets `VITE_API_URL` to the production Render URL automatically on build.

## Build & Deploy

```bash
# Production build
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting --project cargoscan-app-2026
```

CI should run `npm run build` then `firebase deploy`. The `dist/` directory is the hosting target.

## Key Routes

| Path | Component | Auth |
|------|-----------|------|
| `/` | Login / Signup | Public |
| `/dashboard/operations` | Shipments + Work Queue | Authenticated |
| `/dashboard/containers` | Container loading | Authenticated |
| `/dashboard/customers` | Consignee management | Authenticated |
| `/dashboard/mobile` | iOS app install | Authenticated |
| `/dashboard/team` | User management | Admin only |
| `/dashboard/billing` | Plan + Paystack checkout | Admin only |
| `/dashboard/settings` | Org settings, API keys, webhooks | Admin only |
| `/tracking/:code` | Public shipment tracking page | Public |
| `/reset-password?token=` | Password reset | Public |
| `/billing/callback` | Paystack redirect handler | Public |

## Architecture Notes

- `AppShell.jsx` — main app shell, auth state, data loading, keyboard shortcuts
- `TrackingPage.jsx` — standalone public tracking page (self-contained styles)
- `src/components/` — per-tab components (ShipmentsTab, ContainersTab, etc.)
- `App.css` — full design system (dark glassmorphic, Satoshi + Inter, CSS token system)
- Data polling every 12 seconds when tab is visible; toast notification on new scans

## Design System

Design tokens live in `:root` in `App.css`. Key tokens:

```css
--brand: #0ecfb0        /* teal primary */
--indigo: #6d6aff       /* indigo accent */
--bg: #060c18           /* page background */
--fs-xs → --fs-hero     /* typography scale (9 steps) */
--ease, --ease-md        /* motion tokens */
--glass-border           /* glass surface borders */
```
