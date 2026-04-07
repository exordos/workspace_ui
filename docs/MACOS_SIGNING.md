# macOS Code Signing & Notarization Guide

> Step-by-step instructions for signing and notarizing the Workspace desktop app for macOS distribution.

## Why This Is Required

Since macOS 10.14.5, Apple requires all distributed applications to be:

1. **Code-signed** with a Developer ID certificate (proves the app comes from a known developer)
2. **Notarized** via Apple's notary service (Apple scans the app for malware)
3. **Stapled** (the notarization ticket is embedded in the app for offline verification)

Without this, users see "App is damaged and can't be opened" or Gatekeeper blocks the app entirely.

## Prerequisites

| Item                                 | Where to get it                                                                   | Cost     |
| ------------------------------------ | --------------------------------------------------------------------------------- | -------- |
| Apple Developer Program membership   | [developer.apple.com](https://developer.apple.com/programs/)                      | $99/year |
| Developer ID Application certificate | Xcode → Certificates → Developer ID Application                                   | Included |
| App-specific password                | [appleid.apple.com](https://appleid.apple.com) → Sign-In → App-Specific Passwords | Free     |

## Step 1: Create the Certificate

### Option A: Via Xcode (recommended)

1. Open Xcode → Settings → Accounts → select your team
2. Click "Manage Certificates..." → "+" → "Developer ID Application"
3. Xcode creates the certificate and installs it in your Keychain

### Option B: Via Apple Developer Portal

1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click "+" → "Developer ID Application"
3. Upload a Certificate Signing Request (CSR) from Keychain Access
4. Download and install the .cer file

## Step 2: Export the .p12 File

1. Open **Keychain Access** → "My Certificates"
2. Find "Developer ID Application: YOUR_TEAM (TEAM_ID)"
3. Right-click → "Export..." → save as `certificate.p12`
4. Set a strong password (you'll need it as `CSC_KEY_PASSWORD`)

## Step 3: Generate App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → "Sign-In and Security" → "App-Specific Passwords"
3. Click "+" → name it "Workspace Notarize"
4. Copy the generated password (you'll need it as `APPLE_APP_PASSWORD`)

## Step 4: Find Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Look at "Membership Details" → Team ID (10-character string like "A1B2C3D4E5")

## Step 5: Local Signing (Developer Machine)

Set environment variables and build:

```bash
# Code signing
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-p12-password"

# Notarization
export APPLE_ID="your@apple-id.com"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="A1B2C3D4E5"

# Build signed + notarized app
npm run package:electron:mac
```

The build will:

1. Compile the Electron app
2. Sign with the Developer ID certificate
3. Submit to Apple's notary service (~1-5 minutes)
4. Staple the notarization ticket

## Step 6: CI/CD Signing (GitHub Actions)

### Add secrets to GitHub

Go to your repo → Settings → Secrets and variables → Actions → "New repository secret":

| Secret name            | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `MAC_CSC_LINK`         | Base64-encoded .p12 file: `base64 -i certificate.p12 \| pbcopy` |
| `MAC_CSC_KEY_PASSWORD` | Password for the .p12 file                                      |
| `APPLE_ID`             | Your Apple ID email                                             |
| `APPLE_APP_PASSWORD`   | App-specific password from Step 3                               |
| `APPLE_TEAM_ID`        | 10-character Team ID from Step 4                                |

The CI workflow (`.github/workflows/ci.yml`) already passes these secrets to the macOS build job.

## Verification

### Check signing

```bash
codesign --verify --deep --strict --verbose=2 "Workspace.app"
# Expected: valid on disk, satisfies its Designated Requirement

codesign -dv --verbose=4 "Workspace.app" 2>&1 | grep "Authority"
# Expected: Authority=Developer ID Application: YOUR_TEAM (TEAM_ID)
```

### Check notarization

```bash
spctl --assess --type exec --verbose "Workspace.app"
# Expected: accepted, source=Notarized Developer ID

xcrun stapler validate "Workspace.app"
# Expected: The validate action worked!
```

### Check entitlements

```bash
codesign -d --entitlements :- "Workspace.app"
# Shows the entitlements embedded in the binary
```

## Files

| File                                          | Purpose                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `resources/entitlements.mac.plist`            | Main process entitlements (camera, mic, network, files) |
| `resources/entitlements.mac.inherit.plist`    | Child process entitlements (renderer, GPU)              |
| `scripts/notarize.mjs`                        | afterSign hook — submits to Apple's notary service      |
| `electron-builder.yml` → `mac:` section       | Signing configuration                                   |
| `.github/workflows/ci.yml` → `build-electron` | CI job with secrets                                     |

## Troubleshooting

### "App is damaged and can't be opened"

The app was not signed or notarization failed. Check:

- `CSC_LINK` points to a valid .p12 with "Developer ID Application" certificate
- The certificate is not expired (valid for 5 years)
- Notarization completed successfully (check CI logs)

### Notarization rejected

Apple may reject if:

- The app uses deprecated APIs
- Hardened Runtime is not enabled
- The app loads unsigned dynamic libraries

Fix: check `hardenedRuntime: true` in electron-builder.yml and review entitlements.

### "No identity found"

The certificate is not in the keychain. Re-import the .p12:

```bash
security import certificate.p12 -P "password" -A
```

### Build works locally but fails in CI

- Ensure `MAC_CSC_LINK` is base64-encoded (not a file path)
- Ensure the secret doesn't have trailing newlines
- Ensure `macos-latest` runner is used (not `ubuntu-latest`)
