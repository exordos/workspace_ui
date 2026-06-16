#!/usr/bin/env node
/**
 * @deprecated Use `npm run dev:mailcow` (docker compose). Kept as alias.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const down = process.argv.includes("--down");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const script = down ? "dev:mailcow:down" : "dev:mailcow";

const result = spawnSync(npmCmd, ["run", script], { stdio: "inherit", cwd: repoRoot });
process.exit(result.status ?? 1);
