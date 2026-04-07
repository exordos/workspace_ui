#!/usr/bin/env node
/**
 * Version management script — bumps semver across all packages + CHANGELOG.
 *
 * Usage:
 *   node scripts/version.mjs patch        → 0.1.0 → 0.1.1
 *   node scripts/version.mjs minor        → 0.1.0 → 0.2.0
 *   node scripts/version.mjs major        → 0.1.0 → 1.0.0
 *   node scripts/version.mjs 1.2.3        → explicit version
 *   node scripts/version.mjs              → shows current version
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PACKAGE_FILES = [
  "package.json",
  "packages/web/package.json",
  "packages/electron/package.json",
];

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  return pkg.version;
}

function bumpVersion(current, type) {
  if (/^\d+\.\d+\.\d+/.test(type)) return type;

  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    default: throw new Error(`Unknown bump type: ${type}. Use major, minor, patch, or explicit version.`);
  }
}

function updatePackageJson(filePath, newVersion) {
  const full = resolve(ROOT, filePath);
  const pkg = JSON.parse(readFileSync(full, "utf-8"));
  const oldVersion = pkg.version;
  pkg.version = newVersion;
  writeFileSync(full, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ${filePath}: ${oldVersion} → ${newVersion}`);
}

function generateChangelog(version) {
  const date = new Date().toISOString().split("T")[0];
  const header = `## [${version}] — ${date}\n`;

  let commits = "";
  try {
    const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", { encoding: "utf-8" }).trim();
    commits = execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, { encoding: "utf-8" }).trim();
  } catch {
    try {
      commits = execSync("git log --oneline --no-merges -20", { encoding: "utf-8" }).trim();
    } catch {
      commits = "(no git history available)";
    }
  }

  const categorized = { feat: [], fix: [], refactor: [], docs: [], test: [], chore: [], other: [] };
  for (const line of commits.split("\n").filter(Boolean)) {
    const match = line.match(/^[a-f0-9]+ (feat|fix|refactor|docs|test|chore|perf|ci|build|style|revert)(\(.+?\))?:\s*(.+)/);
    if (match) {
      const [, type, , subject] = match;
      const key = type in categorized ? type : "other";
      categorized[key].push(subject);
    } else {
      const subject = line.replace(/^[a-f0-9]+\s+/, "");
      categorized.other.push(subject);
    }
  }

  const labels = {
    feat: "Features", fix: "Bug Fixes", refactor: "Refactoring",
    docs: "Documentation", test: "Tests", chore: "Maintenance", other: "Other",
  };

  let body = "";
  for (const [key, label] of Object.entries(labels)) {
    const items = categorized[key];
    if (items && items.length > 0) {
      body += `\n### ${label}\n\n`;
      for (const item of items) {
        body += `- ${item}\n`;
      }
    }
  }

  return header + (body || "\n- Initial release\n");
}

function updateChangelog(version) {
  const changelogPath = resolve(ROOT, "CHANGELOG.md");
  const entry = generateChangelog(version);

  let existing = "";
  try {
    existing = readFileSync(changelogPath, "utf-8");
  } catch {
    existing = "# Changelog\n\nAll notable changes to this project will be documented in this file.\nFormat based on [Keep a Changelog](https://keepachangelog.com/).\n\n";
  }

  const insertPoint = existing.indexOf("\n## [");
  if (insertPoint > 0) {
    const updated = existing.slice(0, insertPoint) + "\n" + entry + existing.slice(insertPoint);
    writeFileSync(changelogPath, updated);
  } else {
    writeFileSync(changelogPath, existing + "\n" + entry);
  }

  console.log(`  CHANGELOG.md updated`);
}

// --- Main ---

const arg = process.argv[2];

if (!arg) {
  console.log(`Current version: ${readVersion()}`);
  console.log(`\nUsage: node scripts/version.mjs <patch|minor|major|x.y.z>`);
  process.exit(0);
}

const current = readVersion();
const next = bumpVersion(current, arg);

console.log(`\nBumping version: ${current} → ${next}\n`);

for (const file of PACKAGE_FILES) {
  updatePackageJson(file, next);
}

updateChangelog(next);

console.log(`\nNext steps:`);
console.log(`  1. Review CHANGELOG.md`);
console.log(`  2. git add -A && git commit -m "chore: release v${next}"`);
console.log(`  3. git tag v${next}`);
console.log(`  4. git push origin main --tags`);
