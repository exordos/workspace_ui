import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

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

test(
  "Linux package update relaunch waits for exit and passes arguments literally",
  { skip: process.platform === "win32", timeout: 5000 },
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "workspace-update-relaunch-test-"));
    const output = path.join(directory, "launcher output");
    const parentExitMarker = path.join(directory, "parent exiting");
    t.after(() => rmSync(directory, { recursive: true, force: true }));

    const source = readFileSync(
      path.join(__dirname, "..", "src", "linux-package-update-relaunch.lib.ts"),
      "utf8",
    );
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    const library = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    const argument = "value with spaces and $HOME";
    const parent = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { writeFileSync } from "node:fs";
      import { relaunchAfterLinuxPackageUpdate } from ${JSON.stringify(library)};
      process.once("exit", () => writeFileSync(${JSON.stringify(parentExitMarker)}, ""));
      relaunchAfterLinuxPackageUpdate(process.execPath, [
        "-e",
        ${JSON.stringify(`
          const { existsSync, writeFileSync } = require("node:fs");
          const [output, argument, parentExitMarker] = process.argv.slice(1);
          writeFileSync(output, JSON.stringify({
            argument,
            parentExiting: existsSync(parentExitMarker),
          }));
        `)},
        ${JSON.stringify(output)},
        ${JSON.stringify(argument)},
        ${JSON.stringify(parentExitMarker)},
      ]);
      process.stdin.resume();
      process.stdout.write("scheduled");
    `,
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    t.after(() => parent.kill());
    const exited = once(parent, "exit");

    await once(parent.stdout, "data");
    await delay(200);
    assert.equal(existsSync(output), false);
    parent.stdin.end();
    assert.deepEqual(await exited, [0, null]);

    for (let attempt = 0; attempt < 100 && !existsSync(output); attempt++) {
      await delay(20);
    }
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), { argument, parentExiting: true });
  },
);
