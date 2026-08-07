# macOS Code Signing & Notarization Guide

> Step-by-step instructions for signing and notarizing the Workspace desktop app for macOS distribution.

## Why This Is Required

Since macOS 10.14.5, Apple requires all distributed applications to be:

1. **Code-signed** with a Developer ID certificate (proves the app comes from a known developer)
2. **Notarized** via Apple's notary service (Apple scans the app for malware)
3. **Stapled** (the notarization ticket is embedded in the app for offline verification)

Without this, users see "App is damaged and can't be opened" or Gatekeeper blocks the app entirely.

## Prerequisites

| Item                                   | Where to get it                                                 | Cost     |
| -------------------------------------- | --------------------------------------------------------------- | -------- |
| Apple Developer Program membership     | [developer.apple.com](https://developer.apple.com/programs/)    | $99/year |
| Developer ID Application certificate   | Xcode → Certificates → Developer ID Application                 | Included |
| App Store Connect Team API key (`.p8`) | App Store Connect → Users and Access → Integrations → Team Keys | Included |

## Step 1: Create the Certificate

### Option A: Via Xcode (recommended)

1. Open Xcode → Settings → Accounts → select your team
2. Click "Manage Certificates..." → "+" → "Developer ID Application"
3. Xcode creates the certificate and installs it in your Keychain

Use a dedicated Developer ID Application certificate per independently revocable product when the available certificate quota permits it. This keeps a compromised signing key from forcing unrelated products to rotate at the same time.

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

## Step 3: Create an App Store Connect Team API Key

1. Open App Store Connect → Users and Access → Integrations → Team Keys.
2. Create or select a key dedicated to this release pipeline with **App Manager** access, as required by `@electron/notarize`. Team keys remain account-wide, but separate keys provide distinct audit and revocation boundaries.
3. Record the key ID and issuer ID, and download the `.p8` private key once.
4. Store the private key and its metadata in KeePassXC before configuring CI.

The release workflow uses `notarytool` API-key authentication. Apple ID credentials remain supported by the local hook, but they are not the CI default.

The Team API key may also authenticate future Exordos Workspace iOS CI because it belongs to the product's Apple team integration. Platform signing material remains separate: macOS uses Developer ID Application, while iOS distribution requires its own Apple Distribution certificate and provisioning profiles.

## Step 4: Local Signing (Developer Machine)

Set environment variables and build:

```bash
# Code signing
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-p12-password"

# Notarization with an App Store Connect Team API key
export APPLE_API_KEY="/path/to/AuthKey_KEYID.p8"
export APPLE_API_KEY_ID="KEYID12345"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"

# Build signed + notarized app
npm run package:electron:mac
```

The build will:

1. Compile the Electron app
2. Sign with the Developer ID certificate
3. Submit to Apple's notary service (~1-5 minutes)
4. Staple the notarization ticket

## Step 5: CI/CD Signing (GitHub Actions)

The tag-only macOS job uses the protected `macos-release` environment. Its tag policy is `*.*.*`, and required reviewers must approve the job before GitHub exposes signing secrets.

Configure these environment secrets:

| Secret name                       | Value                                                 |
| --------------------------------- | ----------------------------------------------------- |
| `MACOS_CERTIFICATE_P12_BASE64`    | Base64-encoded Developer ID Application `.p12`        |
| `MACOS_CERTIFICATE_PASSWORD`      | Password for the `.p12` export                        |
| `APPLE_API_PRIVATE_KEY_P8_BASE64` | Base64-encoded App Store Connect Team API private key |
| `APPLE_API_KEY_ID`                | App Store Connect key ID                              |
| `APPLE_API_ISSUER_ID`             | App Store Connect issuer UUID                         |

The CI job fails before packaging when any secret is absent. Release publication waits for the signed macOS job, so a tag cannot produce a GitHub Release with unsigned macOS assets.

## Verification

### Check signing

```bash
codesign --verify --deep --strict --verbose=2 "Exordos Workspace.app"
# Expected: valid on disk, satisfies its Designated Requirement

codesign -dv --verbose=4 "Exordos Workspace.app" 2>&1 | grep "Authority"
# Expected: Authority=Developer ID Application: YOUR_TEAM (TEAM_ID)
```

### Check notarization

```bash
spctl --assess --type exec --verbose=4 "Exordos Workspace.app"
# Expected: accepted, source=Notarized Developer ID

xcrun stapler validate "Exordos Workspace.app"
# Expected: The validate action worked!
```

### Check entitlements

```bash
codesign -d --entitlements :- "Exordos Workspace.app"
# Shows the entitlements embedded in the binary
```

## Files

| File                                                         | Purpose                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `packages/electron/resources/entitlements.mac.plist`         | Main process entitlements (camera, mic, network, files) |
| `packages/electron/resources/entitlements.mac.inherit.plist` | Child process entitlements (renderer, GPU)              |
| `packages/electron/scripts/notarize.mjs`                     | afterSign hook — submits to Apple's notary service      |
| `electron-builder.yml` → `mac:` section                      | Signing configuration                                   |
| `.github/workflows/ci.yml` → `build-electron-macos`          | Protected tag-only signing and verification job         |

## Troubleshooting

### "App is damaged and can't be opened"

The app was not signed or notarization failed. Check:

- `CSC_LINK` points to a valid `.p12` with a Developer ID Application certificate
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

- Ensure `MACOS_CERTIFICATE_P12_BASE64` contains the base64-encoded `.p12`
- Ensure the secret doesn't have trailing newlines
- Ensure the App Store Connect `.p8`, key ID, and issuer ID belong to the same Team key
- Ensure the protected `macos-release` deployment was approved
