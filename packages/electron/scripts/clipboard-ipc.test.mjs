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
  assert.match(
    preloadSource,
    /writeText:\s*\(text:\s*string\):\s*Promise<boolean>\s*=>\s*ipcRenderer\.invoke\("clipboard:writeText",\s*text\)/,
  );
  assert.match(
    preloadSource,
    /readText:\s*\(\):\s*Promise<string \| null>\s*=>\s*ipcRenderer\.invoke\("clipboard:readText"\)/,
  );
  assert.match(preloadSource, /textEditing:\s*\{/);
  assert.match(
    preloadSource,
    /execute:\s*\(command:\s*"cut" \| "copy" \| "paste" \| "selectAll"\):\s*void\s*=>\s*ipcRenderer\.send\("textEditing:execute",\s*command\)/,
  );
});

test("main registers clipboard IPC handlers and allows clipboard permissions", () => {
  const mainSource = readFileSync(path.join(srcDir, "main.ts"), "utf8");

  assert.match(mainSource, /ipcMain\.handle\("clipboard:writeText"/);
  assert.match(mainSource, /ipcMain\.handle\("clipboard:readText"/);
  assert.match(mainSource, /"clipboard-read"/);
  assert.match(mainSource, /"clipboard-sanitized-write"/);
  assert.match(mainSource, /setPermissionCheckHandler/);
});

test("main executes only whitelisted text editing commands on the sending web contents", () => {
  const mainSource = readFileSync(path.join(srcDir, "main.ts"), "utf8");
  const handler = mainSource.match(
    /ipcMain\.on\("textEditing:execute",\s*\(event,\s*command:\s*unknown\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);/,
  );

  assert.ok(handler, "text editing IPC handler should be registered");
  assert.match(handler[1], /switch\s*\(command\)/);
  assert.match(handler[1], /case "cut":\s*event\.sender\.cut\(\);\s*break;/);
  assert.match(handler[1], /case "copy":\s*event\.sender\.copy\(\);\s*break;/);
  assert.match(handler[1], /case "paste":\s*event\.sender\.paste\(\);\s*break;/);
  assert.match(handler[1], /case "selectAll":\s*event\.sender\.selectAll\(\);\s*break;/);
  assert.doesNotMatch(handler[1], /mainWindow/);
  assert.doesNotMatch(handler[1], /event\.sender\s*\[/);
});
