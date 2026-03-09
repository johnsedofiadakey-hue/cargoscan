# CargoScan iOS Cloud Build (Codemagic)

This repo now includes:
- `codemagic.yaml` (CI workflow)
- `cargoscan-ios/Gemfile`
- `cargoscan-ios/fastlane/Fastfile`
- `cargoscan-ios/fastlane/Appfile`

## 1) Required before first build

1. Commit a real Xcode project/workspace to this repo:
- Expected default: `cargoscan-ios/CargoScan.xcodeproj`
- Scheme expected: `CargoScan`

2. In Codemagic, add environment variable groups:

### Group: `app_store_connect_credentials`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY` (full `.p8` key content)
- `APP_STORE_APPLE_ID` (optional but recommended)
- `APPLE_ID` (email for App Store Connect)
- `APP_STORE_CONNECT_TEAM_ID` (if needed)

### Group: `ios_signing`
- `BUNDLE_ID` (e.g. `com.yourcompany.cargoscan`)
- `MATCH_GIT_URL` (private cert/profiles repo)
- `MATCH_GIT_BRANCH` (optional; defaults to `main`)
- `MATCH_PASSWORD` (if your match repo is encrypted)
- SSH key or token access so Codemagic can read `MATCH_GIT_URL`

## 2) Confirm workflow variables

In `codemagic.yaml`:
- `XCODE_PROJECT_PATH` or `XCODE_WORKSPACE_PATH`
- `XCODE_SCHEME`

Defaults are set for:
- Project path: `CargoScan.xcodeproj` (inside `cargoscan-ios/`)
- Scheme: `CargoScan`

## 3) Trigger build

Push to branch `work` (workflow configured for that branch), or run manually from Codemagic UI.

## 4) Output

Successful build uploads to TestFlight and stores the IPA as artifact.
