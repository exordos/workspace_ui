#!/usr/bin/env node
/**
 * Aggregates ESLint code-smell warnings (SonarJS, promise, unicorn, etc.) for packages/web.
 * Usage:
 *   node scripts/lint-code-smells-report.mjs [--json] [--category <name>] [--rule <ruleId>] [--top N]
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../packages/web");

const DEFERRED_RULES = new Set([
  "react-hooks/set-state-in-effect",
  "react-hooks/exhaustive-deps",
  "require-atomic-updates",
  "react-hooks/preserve-manual-memoization",
]);

function parseArgs(argv) {
  const opts = { json: false, category: null, rule: null, top: 20 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--category") opts.category = argv[++i] ?? null;
    else if (arg === "--rule") opts.rule = argv[++i] ?? null;
    else if (arg === "--top") opts.top = Number(argv[++i] ?? 20);
  }
  return opts;
}

function categorizeRule(ruleId) {
  if (!ruleId) return "other";
  if (DEFERRED_RULES.has(ruleId)) return "deferred";
  if (ruleId.startsWith("sonarjs/")) return "sonarjs";
  if (ruleId.startsWith("promise/")) return "promise";
  if (ruleId.startsWith("unicorn/")) return "unicorn";
  if (ruleId.startsWith("@typescript-eslint/")) return "typescript";
  if (ruleId.startsWith("react-hooks/")) return "react-hooks";
  if (ruleId.startsWith("import-x/")) return "import";
  if (ruleId.startsWith("jsx-a11y/")) return "a11y";
  return "other";
}

function runEslintJson() {
  try {
    return execSync("npx eslint src -f json", {
      cwd: webRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    if (typeof err.stdout === "string" && err.stdout.trim().startsWith("[")) {
      return err.stdout;
    }
    throw err;
  }
}

const opts = parseArgs(process.argv);
const results = JSON.parse(runEslintJson());

/** @type {{ ruleId: string, file: string, line: number, message: string, category: string }[]} */
const hits = [];

for (const file of results) {
  const rel = file.filePath.replace(`${webRoot}/`, "");
  for (const msg of file.messages) {
    if (msg.severity !== 1 && msg.severity !== 2) continue;
    const ruleId = msg.ruleId ?? "(no rule)";
    const category = categorizeRule(ruleId);
    hits.push({
      ruleId,
      file: rel,
      line: msg.line ?? 0,
      message: msg.message ?? "",
      category,
    });
  }
}

let filtered = hits;
if (opts.category) {
  filtered = filtered.filter((h) => h.category === opts.category);
}
if (opts.rule) {
  filtered = filtered.filter((h) => h.ruleId === opts.rule);
}

const byRule = new Map();
const byCategory = new Map();
const byFile = new Map();

for (const h of hits) {
  byRule.set(h.ruleId, (byRule.get(h.ruleId) ?? 0) + 1);
  byCategory.set(h.category, (byCategory.get(h.category) ?? 0) + 1);
  byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
}

const sortedRules = [...byRule.entries()].sort((a, b) => b[1] - a[1]);
const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
const sortedFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]);

if (opts.json) {
  console.log(
    JSON.stringify(
      {
        total: hits.length,
        filtered: filtered.length,
        byCategory: Object.fromEntries(sortedCategories),
        byRule: Object.fromEntries(sortedRules),
        hits: filtered,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`eslint warnings: ${hits.length} (filtered: ${filtered.length})`);
  console.log("\nBy category:");
  for (const [cat, count] of sortedCategories) {
    console.log(`  ${count.toString().padStart(4)}  ${cat}`);
  }
  console.log(`\nTop rules (max ${opts.top}):`);
  for (const [rule, count] of sortedRules.slice(0, opts.top)) {
    console.log(`  ${count.toString().padStart(4)}  ${rule}`);
  }
  if (opts.category || opts.rule) {
    console.log("\nFiltered hits:");
    const byFileFiltered = new Map();
    for (const h of filtered) {
      const key = `${h.file}:${h.line}`;
      byFileFiltered.set(key, h);
    }
    for (const h of [...byFileFiltered.values()].sort((a, b) =>
      a.file.localeCompare(b.file),
    )) {
      console.log(`  ${h.file}:${h.line}  ${h.ruleId}`);
    }
  } else {
    console.log(`\nTop files (max ${opts.top}):`);
    for (const [file, count] of sortedFiles.slice(0, opts.top)) {
      console.log(`  ${count.toString().padStart(4)}  ${file}`);
    }
  }
}

process.exit(filtered.length > 0 ? 1 : 0);
