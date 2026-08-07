import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderConfig = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8");

test("keeps Debian migration metadata for legacy electron-app installs", () => {
  const debStart = builderConfig.indexOf("\ndeb:\n");
  const rpmStart = builderConfig.indexOf("\nrpm:\n", debStart);

  assert.notEqual(debStart, -1, "electron-builder config must include a deb section");
  assert.notEqual(rpmStart, -1, "electron-builder config must keep deb options scoped to deb");

  const debConfig = builderConfig.slice(debStart, rpmStart);
  assert.match(debConfig, /^  fpm:\n/m);
  assert.match(debConfig, /^    - --conflicts=electron-app$/m);
  assert.match(debConfig, /^    - --replaces=electron-app$/m);
});
