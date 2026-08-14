import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainSource = readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf8");

test("update installation bypasses the hide-to-tray close guard", () => {
  assert.match(
    mainSource,
    /ipcMain\.on\("updater:install",[\s\S]*?isQuitting = true;\s*autoUpdater\.quitAndInstall\(false, true\);/,
  );
});

test("a second launch does not reopen the window during update installation", () => {
  assert.match(
    mainSource,
    /app\.on\("second-instance",[\s\S]*?if \(isQuitting\) return;[\s\S]*?showMainWindow\(\);/,
  );
});
