import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const electronRoot = resolve(__dirname, "..");

let securityPolicyLib;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-security-policy-test-"));
  const outfile = path.join(tempBuildDir, "security-policy.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "security-policy.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  securityPolicyLib = await import(`file://${outfile}`);
});

after(() => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});

describe("getShellContentSecurityPolicy", () => {
  it("allows blob and data media in development", () => {
    const csp = securityPolicyLib.getShellContentSecurityPolicy(true);

    assert.ok(csp.includes("media-src 'self' data: blob: https:"));
  });

  it("allows blob and data media in packaged Electron", () => {
    const csp = securityPolicyLib.getShellContentSecurityPolicy(false);

    assert.ok(csp.includes("media-src 'self' data: blob: https:"));
  });
});
