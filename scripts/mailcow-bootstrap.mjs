#!/usr/bin/env node
/**
 * Prepares mailcow-dockerized for `docker compose -f docker/mailcow/docker-compose.yml`.
 * - Clones upstream on first run
 * - Generates mailcow.conf non-interactively when missing
 * - Links docker/mailcow/.env for Compose variable substitution
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureMailcowDevCerts } from "./mailcow-dev-certs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mailcowRoot = path.join(repoRoot, "docker", "mailcow");
const mailcowDir = path.join(mailcowRoot, "mailcow-dockerized");
const mailcowConf = path.join(mailcowDir, "mailcow.conf");
const mailcowEnvLink = path.join(mailcowDir, ".env");
const projectEnvLink = path.join(mailcowRoot, ".env");

const DEFAULT_HOSTNAME = process.env.MAILCOW_HOSTNAME?.trim() || "mail.example.test";
const DEFAULT_TZ = process.env.MAILCOW_TZ?.trim() || "Europe/Moscow";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureSymlink(target, linkPath) {
  try {
    symlinkSync(target, linkPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EEXIST") {
      throw error;
    }
  }
}

function ensureMailcowClone() {
  if (existsSync(mailcowDir)) {
    return;
  }
  mkdirSync(mailcowRoot, { recursive: true });
  run("git", ["clone", "--depth", "1", "https://github.com/mailcow/mailcow-dockerized.git", mailcowDir]);
}

function ensureMailcowConfig() {
  if (existsSync(mailcowConf)) {
    return;
  }

  console.info(`Generating mailcow.conf (hostname: ${DEFAULT_HOSTNAME})…`);
  ensureSymlink("mailcow.conf", mailcowEnvLink);

  run("bash", ["./generate_config.sh", "--dev"], {
    cwd: mailcowDir,
    env: {
      MAILCOW_HOSTNAME: DEFAULT_HOSTNAME,
      MAILCOW_TZ: DEFAULT_TZ,
    },
  });
}

function syncComposeEnv() {
  if (!existsSync(mailcowConf)) {
    console.error("mailcow.conf is missing after bootstrap.");
    process.exit(1);
  }

  if (!existsSync(mailcowEnvLink)) {
    ensureSymlink("mailcow.conf", mailcowEnvLink);
  }

  if (existsSync(projectEnvLink)) {
    try {
      if (lstatSync(projectEnvLink).isSymbolicLink()) {
        return;
      }
    } catch {
      /* fall through */
    }
    return;
  }

  try {
    ensureSymlink("mailcow-dockerized/mailcow.conf", projectEnvLink);
  } catch {
    copyFileSync(mailcowConf, projectEnvLink);
  }
}

ensureMailcowClone();
ensureMailcowConfig();
syncComposeEnv();
ensureMailcowDevCerts();

console.info(`\nMailcow ready. Admin UI: https://${DEFAULT_HOSTNAME}/admin (admin / moohoo)`);
console.info("TLS: install mkcert for trusted HTTPS — brew install mkcert && mkcert -install");
console.info("     Or trust self-signed cert — npm run dev:mailcow:trust-cert (macOS)\n");
