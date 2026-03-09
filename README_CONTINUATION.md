# CargoScan Native Transition Handoff (March 9, 2026)

This document is the single source of truth for the current redesign status, what is already implemented, and what must be done next to complete a production CargoScan system.

## 1) Target Product Direction

CargoScan is being split into two products that share one backend data model:

1. Web Warehouse Dashboard (`cargoscan-app`)
- Used by warehouse operators on laptops/desktops.
- Creates and edits package records before scanning.
- Displays CBM after native iOS scans are synced.

2. Native iOS Scanner App (`cargoscan-ios`)
- Uses ARKit + RealityKit + Vision.
- Runs only on LiDAR-capable iPhones/iPads for real geometric measurements.
- Supports linked scans (saved) and quick scans (not saved).

## 2) Current Repository Structure

- `cargoscan-app/` -> React web dashboard (Firebase hosting)
- `cargoscan-ios/` -> Swift source files for native scanner logic and UI
- `cargoscan-api/` -> Node/Express API (local dev backend)
- `codemagic.yaml` -> CI workflow for iOS TestFlight builds
- `cargoscan-ios/fastlane/` -> iOS signing/build/upload automation

## 3) What Is Already Implemented

### 3.1 Web Dashboard (`cargoscan-app`)

Implemented in `src/App.jsx`:

- Package creation/editing fields:
  - Customer Name
  - Tracking Number
  - Item Name
  - Description
  - Supplier
  - Shipment ID
  - Quantity
- Packages are created with pending CBM (`null`) until scanned.
- "Refresh Scanned CBM" syncs scanned dimensions/CBM from backend scans endpoint.
- API-backed package sync:
  - Pull packages from `GET /api/packages`
  - Create package via `POST /api/packages`
  - Update package via `PATCH /api/packages/:trackingNumber`
- Dashboard stats now reflect package workflow:
  - Total packages
  - Scanned vs pending scan
  - Total CBM from scanned packages

### 3.2 Native iOS Scanner Logic (`cargoscan-ios`)

Implemented scanner core and workflow:

- ARKit session uses:
  - scene reconstruction mesh
  - horizontal plane detection
  - scene depth semantics (when supported)
- Geometric measurement pipeline (`MeshProcessor.swift`):
  - dominant cluster extraction
  - RANSAC plane fitting
  - edge/plane intersections
  - corner extraction
  - axis derivation
  - dimensions + CBM + confidence
- Validation/rejection rules:
  - cluster too small
  - insufficient planes
  - incomplete corners
  - missing floor
- UI redesign (`ScannerView.swift`):
  - clean outline (no debug point cloud clutter)
  - object confirmation flow
  - bottom result panel for L/W/H/CBM/confidence

### 3.3 Scanner Modes and Backend Sync

Implemented in `ARScannerViewModel.swift`, `ScanRecord.swift`, `ScanSyncService.swift`:

- Scanner Modes:
  - `Linked Scan`: requires tracking number; saves to backend
  - `Quick Scan`: measures but does not persist
- Linked scan payload includes:
  - Tracking Number
  - Length/Width/Height
  - CBM
  - Timestamp
  - Operator ID
  - Photo (base64)
  - Confidence score
- Package lookup by tracking number before scan in linked mode.
- Offline queue for scans if API unavailable.
- Retry sync support from UI.

### 3.4 Dev Backend (`cargoscan-api/server.js`)

Implemented endpoints:

- `POST /api/packages`
- `GET /api/packages`
- `PATCH /api/packages/:trackingNumber`
- `POST /api/scans` (links scan to package by tracking number and updates CBM)
- `GET /api/scans`
- `GET /health`

### 3.5 CI / Distribution Setup

Implemented cloud build scaffolding:

- `codemagic.yaml` workflow `ios_testflight`
- `cargoscan-ios/Gemfile`
- `cargoscan-ios/fastlane/Fastfile`
- `cargoscan-ios/fastlane/Appfile`
- `cargoscan-ios/CODEMAGIC_SETUP.md`

## 4) Commits Already Created Locally

Recent commits on `work` branch:

- `4a25ab9` Complete LiDAR scanner redesign using geometric feature detection
- `efbaeb5` Add Codemagic and fastlane pipeline for iOS TestFlight builds
- `099c277` Implement native iOS LiDAR workflow with linked package scanning and web package records
- `cc4b237` Wire package records to backend API and sync scanned CBM updates

## 5) Critical Remaining Work (to reach production)

### 5.1 iOS Project Packaging (BLOCKER)

Swift source exists, but a committed Xcode project/workspace is still required:

- Need `CargoScan.xcodeproj` (or `.xcworkspace`) in `cargoscan-ios/`
- Need proper target configuration and Info.plist entries
- Need signing/capabilities configured

Without this, Codemagic cannot build TestFlight.

### 5.2 Security/Production Backend

Current `cargoscan-api` is development-grade memory storage.

Must add:

- Persistent DB (Postgres/Supabase/etc.)
- Authn/Authz (operators, org isolation)
- Validation and request signing
- Media storage for scan photos (S3/Supabase Storage)
- Rate limiting, audit logs, retry-safe idempotency

### 5.3 Web API Base URL

`cargoscan-app` currently defaults to local API (`http://localhost:3000/api`) for developer convenience.

For production deploy:
- set API base to real backend URL
- secure CORS and auth headers

### 5.4 Device Constraints

True LiDAR measurement requires Pro devices:
- iPhone Pro / Pro Max models with LiDAR
- iPad Pro models with LiDAR

Non-Pro iPhones can test flow but not real LiDAR geometry quality.

## 6) How to Run Current System Locally

### Backend

```bash
cd /Users/truth/cargoscan/cargoscan-api
npm install
node server.js
```

### Web Dashboard

```bash
cd /Users/truth/cargoscan/cargoscan-app
npm install
npm run dev
```

### Build and Deploy Web

```bash
cd /Users/truth/cargoscan/cargoscan-app
npm run build
firebase deploy
```

## 7) End-to-End Test Flow (Current)

1. In web dashboard, open Packages tab.
2. Create package record with tracking number (CBM empty).
3. In iOS app, use Linked Scan mode and same tracking number.
4. Complete scan; app syncs scan payload.
5. In web app, click Refresh Scanned CBM.
6. Package row should update with dimensions/CBM and scanned status.

## 8) Codemagic Setup Summary

Read full details in `cargoscan-ios/CODEMAGIC_SETUP.md`.

Required env groups in Codemagic:

- `app_store_connect_credentials`
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_ISSUER_ID`
  - `APP_STORE_CONNECT_PRIVATE_KEY`
  - optional `APP_STORE_APPLE_ID`, `APPLE_ID`, `APP_STORE_CONNECT_TEAM_ID`

- `ios_signing`
  - `BUNDLE_ID`
  - `MATCH_GIT_URL`
  - optional `MATCH_GIT_BRANCH`, `MATCH_PASSWORD`

## 9) Suggested Next Tasks for Next Agent

1. Generate and commit real iOS Xcode project (`CargoScan.xcodeproj`) in `cargoscan-ios/`.
2. Add required iOS plist permissions and verify on physical LiDAR device.
3. Replace in-memory API with persistent DB and per-org auth.
4. Add package search/filter and status timeline in web UI.
5. Add scanner calibration/test suite and confidence threshold policy.
6. Complete TestFlight pipeline execution from Codemagic.

## 10) Notes About Data Safety

- Core source changes are committed on `work` branch.
- This handoff document is intended to prevent context loss when cloning and resuming.
- If remote push is unavailable in a given environment, local commits still preserve all work in git history.
