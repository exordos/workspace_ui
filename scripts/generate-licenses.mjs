#!/usr/bin/env node
/**
 * Generate licenses.json from all dependencies.
 * Output: packages/web/src/generated/licenses.json
 *
 * Usage:
 *   node scripts/generate-licenses.mjs
 *   npm run licenses
 */
import { init } from "license-checker";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(ROOT, "packages", "web", "src", "generated");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "licenses.json");

init(
  {
    start: ROOT,
    excludePrivatePackages: true,
  },
  (err, packages) => {
    if (err) {
      console.error("License check failed:", err);
      process.exit(1);
    }

    const entries = Object.entries(packages)
      .map(([nameVersion, info]) => {
        const atIndex = nameVersion.lastIndexOf("@");
        const name = atIndex > 0 ? nameVersion.slice(0, atIndex) : nameVersion;
        const version = atIndex > 0 ? nameVersion.slice(atIndex + 1) : "";

        return {
          name,
          version,
          license: String(info.licenses ?? "Unknown"),
          repository: String(info.repository ?? ""),
          publisher: String(info.publisher ?? ""),
        };
      })
      .filter((e) => e.name !== "workspace" && !e.name.startsWith("workspace@"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const byLicense = {};
    for (const e of entries) {
      byLicense[e.license] = (byLicense[e.license] ?? 0) + 1;
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2));

    console.log(`✓ ${entries.length} packages → ${OUTPUT_FILE}`);
    console.log("  Licenses:", Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} (${c})`).join(", "));
  },
);
