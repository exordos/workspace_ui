#!/usr/bin/env node
/**
 * Counts ESLint sonarjs/cognitive-complexity warnings in packages/web.
 * Usage: node scripts/count-cognitive-complexity.mjs [--json]
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../packages/web");
const jsonMode = process.argv.includes("--json");

function runEslintJson() {
  try {
    return execSync("npx eslint src -f json", {
      cwd: webRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    // ESLint exits 1 when warnings/errors exist; JSON is still on stdout.
    if (typeof err.stdout === "string" && err.stdout.trim().startsWith("[")) {
      return err.stdout;
    }
    throw err;
  }
}

const raw = runEslintJson();

const results = JSON.parse(raw);
const hits = [];

for (const file of results) {
  for (const msg of file.messages) {
    if (msg.ruleId !== "sonarjs/cognitive-complexity") continue;
    const match = /from (\d+) to the (\d+) allowed/.exec(msg.message);
    hits.push({
      file: file.filePath.replace(`${webRoot}/`, ""),
      line: msg.line,
      complexity: match ? Number(match[1]) : null,
      threshold: match ? Number(match[2]) : null,
    });
  }
}

hits.sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0));

if (jsonMode) {
  console.log(JSON.stringify({ count: hits.length, hits }, null, 2));
} else {
  console.log(`cognitive-complexity warnings: ${hits.length}`);
  for (const h of hits) {
    console.log(`  CC ${h.complexity}  ${h.file}:${h.line}`);
  }
}

process.exit(hits.length > 0 ? 1 : 0);
