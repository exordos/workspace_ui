import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, "..", "src");

test("preload exposes clipboard bridge methods", () => {
  const preloadSource = readFileSync(path.join(srcDir, "preload.ts"), "utf8");

  assert.match(preloadSource, /clipboard:\s*\{/);
  assert.match(preloadSource, /writeText:\s*\(text:\s*string\):\s*Promise<boolean>\s*=>\s*ipcRenderer\.invoke\("clipboard:writeText",\s*text\)/);
  assert.match(preloadSource, /readText:\s*\(\):\s*Promise<string \| null>\s*=>\s*ipcRenderer\.invoke\("clipboard:readText"\)/);
});

test("main registers clipboard IPC handlers and allows clipboard permissions", () => {
  const mainSource = readFileSync(path.join(srcDir, "main.ts"), "utf8");

  assert.match(mainSource, /ipcMain\.handle\("clipboard:writeText"/);
  assert.match(mainSource, /ipcMain\.handle\("clipboard:readText"/);
  assert.match(mainSource, /"clipboard-read"/);
  assert.match(mainSource, /"clipboard-sanitized-write"/);
  assert.match(mainSource, /setPermissionCheckHandler/);
});
