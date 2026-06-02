#!/usr/bin/env node
/**
 * Creates and pushes a git tag for the current lerna fixed version (no "v" prefix).
 * Does not push branches — direct push to master is forbidden; merge via MR first.
 *
 * Usage:
 *   node scripts/release-tag.mjs           # tag + push tag to origin
 *   node scripts/release-tag.mjs --dry-run # print commands only
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function readLernaVersion() {
  const { version } = JSON.parse(readFileSync(resolve(root, "lerna.json"), "utf-8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid lerna.json version: ${String(version)}`);
  }
  return version;
}

function run(cmd, label) {
  console.log(`${dryRun ? "[dry-run] " : ""}${label}: ${cmd}`);
  if (!dryRun) {
    execSync(cmd, { cwd: root, stdio: "inherit" });
  }
}

function tagExists(version) {
  try {
    execSync(`git rev-parse refs/tags/${version}`, { cwd: root, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const version = readLernaVersion();
const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));

if (rootPkg.version !== version) {
  console.error(
    `Root package.json (${rootPkg.version}) does not match lerna.json (${version}).`,
  );
  console.error("Run: npm run version:bump -- <patch|minor|major> to align versions.");
  process.exit(1);
}

if (tagExists(version)) {
  console.error(`Tag ${version} already exists locally. Delete it or bump version first.`);
  process.exit(1);
}

console.log(`Publishing release tag ${version} (matches CI tag filter, no "v" prefix)\n`);

run(`git tag ${version}`, "Create tag");
run(`git push origin ${version}`, "Push tag");

console.log("\nDone. GitHub Actions will build Electron and create a GitHub Release on tag push.");
console.log("Ensure the tagged commit is on master (merge release MR before tagging).");
