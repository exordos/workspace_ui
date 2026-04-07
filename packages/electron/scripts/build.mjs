#!/usr/bin/env node
/**
 * Build Electron main process and preload script with esbuild.
 * Also copies the web build output into renderer/.
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const webDist = resolve(root, "..", "web", "dist");
const rendererDir = resolve(root, "renderer");

const commonOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

async function main() {
  await Promise.all([
    build({
      ...commonOptions,
      entryPoints: [resolve(root, "src", "main.ts")],
      outfile: resolve(root, "dist", "main.js"),
      format: "cjs",
    }),
    build({
      ...commonOptions,
      entryPoints: [resolve(root, "src", "preload.ts")],
      outfile: resolve(root, "dist", "preload.js"),
      format: "cjs",
    }),
  ]);

  if (existsSync(webDist)) {
    if (!existsSync(rendererDir)) {
      mkdirSync(rendererDir, { recursive: true });
    }
    cpSync(webDist, rendererDir, { recursive: true });
    console.log(`✓ Copied web build → renderer/`);
  } else {
    console.warn(`⚠ Web build not found at ${webDist}. Run 'npm run build' in packages/web first.`);
  }

  console.log("✓ Electron build complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
