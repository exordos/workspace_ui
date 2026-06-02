#!/usr/bin/env node
/**
 * Bumps fixed monorepo version via Lerna (root + packages/*).
 *
 * Usage:
 *   npm run version:bump -- patch
 *   npm run version:bump -- minor
 *   npm run version:bump -- major
 *   npm run version:bump -- 1.2.3
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bump = process.argv[2];

function readVersion() {
  return JSON.parse(readFileSync(resolve(root, "lerna.json"), "utf-8")).version;
}

if (!bump) {
  console.log(`Current version: ${readVersion()}`);
  console.log("\nUsage: npm run version:bump -- <patch|minor|major|x.y.z>");
  process.exit(0);
}

execSync(
  `lerna version ${bump} --no-git-tag-version --no-push --yes --force-publish`,
  { cwd: root, stdio: "inherit" },
);

const next = readVersion();
const rootVersion = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf-8"),
).version;

console.log(`\nVersion after bump: lerna.json=${next}, package.json=${rootVersion}`);

if (rootVersion !== next) {
  console.error(
    "\nRoot package.json was not updated by Lerna. Check lerna.json packages includes \".\".",
  );
  process.exit(1);
}

console.log("\nNext steps:");
console.log("  1. Update CHANGELOG.md manually (if needed)");
console.log(`  2. git add -A && git commit -m "chore: release v${next}"`);
console.log("  3. Open MR to master and merge (direct push to master is forbidden)");
console.log("  4. On merged master: npm run version:tag   # push tag only");
console.log("\nNote: GitHub Release is created only on tag push (not on branch push alone).");
