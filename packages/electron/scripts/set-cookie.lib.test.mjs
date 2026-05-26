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

let setCookieLib;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-set-cookie-test-"));
  const outfile = path.join(tempBuildDir, "set-cookie.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "set-cookie.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  setCookieLib = await import(outfile);
});

after(() => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});

describe("parseSetCookieHeader", () => {
  it("parses Zulip session cookie attributes", () => {
    const parsed = setCookieLib.parseSetCookieHeader(
      "__Host-sessionid=abc123; Path=/; HttpOnly; Max-Age=1209600; SameSite=Lax; Secure",
    );
    assert.deepEqual(parsed, {
      name: "__Host-sessionid",
      value: "abc123",
      path: "/",
      httpOnly: true,
      secure: true,
      maxAge: 1209600,
    });
  });

  it("returns null for malformed cookie header", () => {
    assert.equal(setCookieLib.parseSetCookieHeader(""), null);
    assert.equal(setCookieLib.parseSetCookieHeader("invalid"), null);
  });
});
