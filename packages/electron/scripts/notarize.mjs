/**
 * macOS notarization — afterSign hook for electron-builder.
 *
 * Apple requires all distributed macOS apps to be:
 * 1. Code-signed with a Developer ID certificate
 * 2. Notarized via Apple's notary service (checks for malware)
 * 3. Stapled (the notarization ticket is attached to the binary)
 *
 * This script runs automatically after electron-builder signs the app.
 * It uses @electron/notarize to submit the app to Apple and wait for approval.
 *
 * Preferred CI authentication uses an App Store Connect Team API key:
 *   APPLE_API_KEY       — absolute path to the downloaded .p8 private key
 *   APPLE_API_KEY_ID    — 10-character App Store Connect key ID
 *   APPLE_API_ISSUER    — App Store Connect issuer UUID
 *
 * Apple ID credentials remain supported for local builds:
 *   APPLE_ID                     — Apple Developer account email
 *   APPLE_APP_SPECIFIC_PASSWORD  — app-specific password
 *   APPLE_TEAM_ID                — 10-character Apple Developer Team ID
 */

import { notarize } from "@electron/notarize";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const value = (environment, name) => environment[name]?.trim() || undefined;

/**
 * Resolve exactly one complete notarytool credential set.
 *
 * @param {NodeJS.ProcessEnv} environment
 * @returns {import("@electron/notarize").NotaryToolCredentials | undefined}
 */
export function resolveNotarizationCredentials(environment = process.env) {
  const appleApiKey = value(environment, "APPLE_API_KEY");
  const appleApiKeyId = value(environment, "APPLE_API_KEY_ID");
  const appleApiIssuer = value(environment, "APPLE_API_ISSUER");
  const apiValues = [appleApiKey, appleApiKeyId, appleApiIssuer];
  const hasApiCredentials = apiValues.some(Boolean);

  const appleId = value(environment, "APPLE_ID");
  const appleIdPassword =
    value(environment, "APPLE_APP_SPECIFIC_PASSWORD") ?? value(environment, "APPLE_APP_PASSWORD");
  const teamId = value(environment, "APPLE_TEAM_ID");
  const appleIdValues = [appleId, appleIdPassword, teamId];
  const hasAppleIdCredentials = appleIdValues.some(Boolean);

  if (hasApiCredentials && hasAppleIdCredentials) {
    throw new Error(
      "Configure either App Store Connect API credentials or Apple ID credentials, not both",
    );
  }

  if (hasApiCredentials) {
    if (!apiValues.every(Boolean)) {
      throw new Error(
        "APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER must be configured together",
      );
    }
    return {
      appleApiKey,
      appleApiKeyId,
      appleApiIssuer,
    };
  }

  if (hasAppleIdCredentials) {
    if (!appleIdValues.every(Boolean)) {
      throw new Error(
        "APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID must be configured together",
      );
    }
    return {
      appleId,
      appleIdPassword,
      teamId,
    };
  }

  return undefined;
}

/**
 * @param {import("electron-builder").AfterPackContext} context
 */
export default async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== "darwin") {
    console.log("⏭️  Skipping notarization: not macOS");
    return;
  }

  // Local unsigned builds remain possible; partially configured release credentials fail closed.
  const credentials = resolveNotarizationCredentials();

  if (!credentials) {
    console.log("⏭️  Skipping notarization: no notarytool credentials configured");
    return;
  }

  // Read appId from electron-builder config
  const builderConfig = readFileSync(join(__dirname, "..", "electron-builder.yml"), "utf-8");
  const appIdMatch = builderConfig.match(/^appId:\s*(.+)$/m);
  const appId = appIdMatch?.[1]?.trim() ?? "com.exordos.workspace";

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);

  console.log(`🍎 Notarizing ${appPath}...`);
  console.log(`   App ID:   ${appId}`);

  const startTime = Date.now();

  try {
    await notarize({
      appPath,
      ...credentials,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Notarization complete (${elapsed}s)`);
  } catch (error) {
    console.error("❌ Notarization failed:", error.message);
    console.error("   Common issues:");
    console.error("   - Invalid App Store Connect API key or Apple ID credentials");
    console.error("   - App not properly code-signed (check CSC_LINK / CSC_KEY_PASSWORD)");
    throw error;
  }
}
