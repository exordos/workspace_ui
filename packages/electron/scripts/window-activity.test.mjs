import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

test("minimizing the window reports an inactive renderer", () => {
  assert.match(
    mainSource,
    /mainWindow\.on\("minimize",\s*\(\)\s*=>\s*sendWindowActivity\(false\)\);/,
  );
});
