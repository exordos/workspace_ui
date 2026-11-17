import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

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

    const relaunchModule = fileURLToPath(
      new URL("../src/linux-package-update-relaunch.lib.ts", import.meta.url),
    );
    const argument = "value with spaces and $HOME";
    const parent = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "-e",
        `
          const { writeFileSync } = require("node:fs");
          const [relaunchModule, parentExitMarker, output, argument] = process.argv.slice(1);
          const { relaunchAfterLinuxPackageUpdate } = require(relaunchModule);
          process.once("exit", () => writeFileSync(parentExitMarker, ""));
          relaunchAfterLinuxPackageUpdate("/bin/bash", [
            "-c",
            'test -f "$1" && printf "%s" "$3" > "$2"',
            "workspace-test",
            parentExitMarker,
            output,
            argument,
          ]);
          process.stdin.resume();
          process.stdout.write("scheduled");
        `,
        relaunchModule,
        parentExitMarker,
        output,
        argument,
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
    assert.equal(readFileSync(output, "utf8"), argument);
  },
);
