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
 * Required environment variables (set in CI or .env):
 *   APPLE_ID              — Apple Developer account email
 *   APPLE_APP_PASSWORD    — App-specific password (NOT your Apple ID password)
 *   APPLE_TEAM_ID         — 10-character Team ID from developer.apple.com
 *
 * To generate an app-specific password:
 *   1. Go to appleid.apple.com → Sign-In and Security → App-Specific Passwords
 *   2. Generate a new password, name it "Workspace Notarize"
 *   3. Store it as APPLE_APP_PASSWORD in CI secrets
 *
 * To find your Team ID:
 *   1. Go to developer.apple.com/account → Membership Details
 *   2. Copy the 10-character Team ID (e.g., "A1B2C3D4E5")
 */

import { notarize } from "@electron/notarize";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Skip if signing env vars are not set (local dev builds)
  const appleId = process.env.APPLE_ID;
  const appleAppPassword = process.env.APPLE_APP_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleAppPassword || !appleTeamId) {
    console.log("⏭️  Skipping notarization: APPLE_ID, APPLE_APP_PASSWORD, or APPLE_TEAM_ID not set");
    console.log("   Set these env vars in CI to enable notarization.");
    return;
  }

  // Read appId from electron-builder config
  const builderConfig = readFileSync(
    join(__dirname, "..", "electron-builder.yml"),
    "utf-8",
  );
  const appIdMatch = builderConfig.match(/^appId:\s*(.+)$/m);
  const appId = appIdMatch?.[1]?.trim() ?? "com.workspace.app";

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);

  console.log(`🍎 Notarizing ${appPath}...`);
  console.log(`   Team ID:  ${appleTeamId}`);
  console.log(`   App ID:   ${appId}`);

  const startTime = Date.now();

  try {
    await notarize({
      tool: "notarytool",
      appPath,
      appleId,
      appleIdPassword: appleAppPassword,
      teamId: appleTeamId,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Notarization complete (${elapsed}s)`);
  } catch (error) {
    console.error("❌ Notarization failed:", error.message);
    console.error("   Common issues:");
    console.error("   - Invalid APPLE_APP_PASSWORD (generate a new app-specific password)");
    console.error("   - Incorrect APPLE_TEAM_ID (check developer.apple.com)");
    console.error("   - App not properly code-signed (check CSC_LINK / CSC_KEY_PASSWORD)");
    throw error;
  }
}
