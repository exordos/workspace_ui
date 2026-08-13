#!/usr/bin/env node
/**
 * Development script:
 * 1. Builds main process + preload with esbuild (watch mode)
 * 2. Waits for the Vite dev server to be ready
 * 3. Launches Electron pointing at localhost:5173
 *
 * Usage: run `npm run dev:web` in another terminal first, then `npm run dev` here.
 * Or use root `npm run dev:electron` which starts both.
 */
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { getMainEsbuildDefine } from "./get-main-esbuild-define.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEV_URL = "http://localhost:5173";

const commonOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

async function buildElectron() {
  await Promise.all([
    build({
      ...commonOptions,
      entryPoints: [resolve(root, "src", "main.ts")],
      outfile: resolve(root, "dist", "main.js"),
      format: "cjs",
      define: getMainEsbuildDefine(),
    }),
    build({
      ...commonOptions,
      entryPoints: [resolve(root, "src", "preload.ts")],
      outfile: resolve(root, "dist", "preload.js"),
      format: "cjs",
    }),
  ]);
}

function waitForDevServer(url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            retry();
          }
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Dev server not ready after ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

async function main() {
  console.log("Building Electron main process...");
  await buildElectron();

  console.log(`Waiting for Vite dev server at ${DEV_URL}...`);
  await waitForDevServer(DEV_URL);
  console.log("✓ Dev server ready");

  const electronBinCandidates = [
    resolve(root, "node_modules", ".bin", "electron"),
    resolve(root, "..", "..", "node_modules", ".bin", "electron"),
  ];
  const electronBin = electronBinCandidates.find(existsSync);
  if (electronBin == null) {
    throw new Error("Electron binary not found. Run npm install from the workspace root.");
  }
  const child = spawn(electronBin, [resolve(root, "dist", "main.js")], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
