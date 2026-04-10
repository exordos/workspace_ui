import test from "node:test";
import assert from "node:assert/strict";
import { isElectronDisableAutoUpdateEnv } from "./electron-build-flags.mjs";

test("isElectronDisableAutoUpdateEnv", () => {
  assert.equal(isElectronDisableAutoUpdateEnv(undefined), false);
  assert.equal(isElectronDisableAutoUpdateEnv(""), false);
  assert.equal(isElectronDisableAutoUpdateEnv("0"), false);
  assert.equal(isElectronDisableAutoUpdateEnv("false"), false);
  assert.equal(isElectronDisableAutoUpdateEnv("1"), true);
  assert.equal(isElectronDisableAutoUpdateEnv("true"), true);
  assert.equal(isElectronDisableAutoUpdateEnv("TRUE"), true);
  assert.equal(isElectronDisableAutoUpdateEnv(" yes "), true);
});
