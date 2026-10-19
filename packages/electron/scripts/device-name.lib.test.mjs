import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const electronRoot = fileURLToPath(new URL("..", import.meta.url));
let deviceName;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-device-name-test-"));
  const outfile = path.join(tempBuildDir, "device-name.lib.mjs");
  await build({
    entryPoints: [path.join(electronRoot, "src/device-name.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  deviceName = await import(`file://${outfile}`);
});

after(() => {
  if (tempBuildDir) rmSync(tempBuildDir, { recursive: true, force: true });
});

test("macOS and Linux prefer a bounded pretty-name command without a shell", async () => {
  for (const [platform, file, args] of [
    ["darwin", "/usr/sbin/scutil", ["--get", "ComputerName"]],
    ["linux", "/usr/bin/hostnamectl", ["--pretty"]],
  ]) {
    const name = await deviceName.resolveSystemDeviceName({
      platform,
      hostname: () => assert.fail("hostname should not override the pretty name"),
      runCommand: async (actualFile, actualArgs, options) => {
        assert.equal(actualFile, file);
        assert.deepEqual(actualArgs, args);
        assert.equal(options.timeout, 1000);
        assert.equal(options.maxBuffer, 16 * 1024);
        assert.equal(options.killSignal, "SIGKILL");
        assert.equal(options.shell, undefined);
        return "  Ноутбук Адама \n";
      },
    });
    assert.equal(name, "Ноутбук Адама");
  }
});

test("empty, missing, timed-out or failed commands fall back to hostname", async () => {
  for (const platform of ["darwin", "linux"]) {
    for (const output of ["", " \n", new Error("ENOENT"), new Error("timeout")]) {
      assert.equal(
        await deviceName.resolveSystemDeviceName({
          platform,
          hostname: () => "  workstation-01  ",
          runCommand: async () => {
            if (output instanceof Error) throw output;
            return output;
          },
        }),
        "workstation-01",
      );
    }
  }
});

test("Windows and other platforms use hostname directly and tolerate its absence", async () => {
  for (const platform of ["win32", "freebsd"]) {
    const sources = {
      platform,
      hostname: () => "DESKTOP-7K2M",
      runCommand: async () => assert.fail("no command expected"),
    };
    assert.equal(await deviceName.resolveSystemDeviceName(sources), "DESKTOP-7K2M");
    assert.equal(
      await deviceName.resolveSystemDeviceName({ ...sources, hostname: () => " " }),
      null,
    );
    assert.equal(
      await deviceName.resolveSystemDeviceName({
        ...sources,
        hostname: () => {
          throw new Error("unavailable");
        },
      }),
      null,
    );
  }
});

function createRequest(url = "http://localhost:5173/#/chat") {
  const frame = { url, detached: false };
  const sender = { mainFrame: frame, isDestroyed: () => false };
  return { sender, senderFrame: frame };
}

test("IPC allows only the main window main frame at the trusted shell URL", async () => {
  for (const [url, shellUrl] of [
    ["http://localhost:5173/#/chat", "http://localhost:5173"],
    ["file:///app/web/index.html#/chat", "file:///app/web/index.html"],
  ]) {
    const request = createRequest(url);
    assert.equal(
      await deviceName.getDeviceNameForRequest(
        request,
        request.sender,
        shellUrl,
        async () => "Mac",
      ),
      "Mac",
    );
  }

  const request = createRequest();
  const cases = [
    [request, null, "http://localhost:5173"],
    [request, createRequest().sender, "http://localhost:5173"],
    [{ ...request, senderFrame: null }, request.sender, "http://localhost:5173"],
    [
      { ...request, senderFrame: { url: request.senderFrame.url, detached: false } },
      request.sender,
      "http://localhost:5173",
    ],
  ];
  for (const url of [
    "https://evil.example",
    "http://localhost:5174",
    "http://user@localhost:5173",
    "invalid",
  ]) {
    const invalid = createRequest(url);
    cases.push([invalid, invalid.sender, "http://localhost:5173"]);
  }
  for (const url of ["file:///app/other.html", "file://remote/app/web/index.html"]) {
    const invalid = createRequest(url);
    cases.push([invalid, invalid.sender, "file:///app/web/index.html"]);
  }
  const detached = createRequest();
  detached.senderFrame.detached = true;
  cases.push([detached, detached.sender, "http://localhost:5173"]);
  const destroyed = createRequest();
  destroyed.sender.isDestroyed = () => true;
  cases.push([destroyed, destroyed.sender, "http://localhost:5173"]);

  for (const [event, sender, shellUrl] of cases) {
    assert.equal(
      await deviceName.getDeviceNameForRequest(event, sender, shellUrl, async () =>
        assert.fail("must reject before reading hostname"),
      ),
      null,
    );
  }
});

test("IPC discards the result if the shell navigates while resolving its name", async () => {
  const request = createRequest();
  assert.equal(
    await deviceName.getDeviceNameForRequest(
      request,
      request.sender,
      "http://localhost:5173",
      async () => {
        request.senderFrame.url = "https://evil.example";
        return "Private computer name";
      },
    ),
    null,
  );
});
