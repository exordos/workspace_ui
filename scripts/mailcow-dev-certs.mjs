#!/usr/bin/env node
/**
 * Installs dev TLS certs for Mailcow nginx (data/assets/ssl/{cert,key}.pem).
 *
 * Prefers mkcert (browser-trusted locally). Falls back to OpenSSL self-signed.
 *
 * Usage:
 *   node scripts/mailcow-dev-certs.mjs
 *   MAILCOW_HOSTNAME=mail.example.test node scripts/mailcow-dev-certs.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mailcowRoot = path.join(repoRoot, "docker", "mailcow");
const mailcowDir = path.join(mailcowRoot, "mailcow-dockerized");
const mailcowConf = path.join(mailcowDir, "mailcow.conf");
const sslDir = path.join(mailcowDir, "data", "assets", "ssl");

const DEFAULT_HOSTNAME = process.env.MAILCOW_HOSTNAME?.trim() || "mail.example.test";
const FORCE = process.env.MAILCOW_TLS_FORCE === "1" || process.argv.includes("--force");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio ?? "inherit",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
  });
  return result.status ?? 1;
}

function commandExists(cmd) {
  return run("sh", ["-c", `command -v ${cmd}`], { stdio: "pipe" }) === 0;
}

function readHostname() {
  if (!existsSync(mailcowConf)) {
    return DEFAULT_HOSTNAME;
  }
  const content = readFileSync(mailcowConf, "utf8");
  const match = /^MAILCOW_HOSTNAME=(.+)$/m.exec(content);
  const hostname = match?.[1]?.trim();
  return hostname != null && hostname.length > 0 ? hostname : DEFAULT_HOSTNAME;
}

function ensureSkipLetsEncrypt() {
  if (!existsSync(mailcowConf)) {
    return;
  }
  let content = readFileSync(mailcowConf, "utf8");
  if (/^SKIP_LETS_ENCRYPT=y$/m.test(content)) {
    return;
  }
  if (/^SKIP_LETS_ENCRYPT=/m.test(content)) {
    content = content.replace(/^SKIP_LETS_ENCRYPT=.*$/m, "SKIP_LETS_ENCRYPT=y");
  } else {
    content += "\nSKIP_LETS_ENCRYPT=y\n";
  }
  writeFileSync(mailcowConf, content, { mode: 0o600 });
}

function certPathsForHostname(hostname) {
  const certStore = path.join(mailcowRoot, "certs", hostname);
  return {
    certStore,
    certFile: path.join(certStore, "cert.pem"),
    keyFile: path.join(certStore, "key.pem"),
    metaFile: path.join(certStore, ".source"),
  };
}

function certsAreFresh(hostname) {
  if (FORCE) {
    return false;
  }
  const { certFile, keyFile, metaFile } = certPathsForHostname(hostname);
  return existsSync(certFile) && existsSync(keyFile) && existsSync(metaFile);
}

function installToMailcowSsl(certFile, keyFile) {
  mkdirSync(sslDir, { recursive: true });
  copyFileSync(certFile, path.join(sslDir, "cert.pem"));
  copyFileSync(keyFile, path.join(sslDir, "key.pem"));
}

function generateWithMkcert(hostname) {
  const { certStore, certFile, keyFile, metaFile } = certPathsForHostname(hostname);
  mkdirSync(certStore, { recursive: true });

  run("mkcert", ["-install"], { stdio: "pipe" });
  const status = run("mkcert", [
    "-key-file",
    keyFile,
    "-cert-file",
    certFile,
    hostname,
    `*.${hostname}`,
    "localhost",
    "127.0.0.1",
  ]);
  if (status !== 0) {
    return false;
  }
  writeFileSync(metaFile, "mkcert\n", "utf8");
  console.info(`TLS: mkcert certificate for ${hostname}`);
  return true;
}

function generateWithOpenssl(hostname) {
  const { certStore, certFile, keyFile, metaFile } = certPathsForHostname(hostname);
  mkdirSync(certStore, { recursive: true });

  const subj = `/CN=${hostname}`;
  const san = `subjectAltName=DNS:${hostname},DNS:*.${hostname},DNS:localhost,IP:127.0.0.1`;
  const status = run("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-days",
    "825",
    "-newkey",
    "rsa:4096",
    "-keyout",
    keyFile,
    "-out",
    certFile,
    "-subj",
    subj,
    "-addext",
    san,
  ]);
  if (status !== 0) {
    console.error("Failed to generate OpenSSL certificate.");
    process.exit(1);
  }
  writeFileSync(metaFile, "openssl\n", "utf8");
  console.info(`TLS: OpenSSL self-signed certificate for ${hostname}`);
  console.info("      Browser will warn until you trust it: npm run dev:mailcow:trust-cert");
  return true;
}

function restartNginxIfRunning() {
  if (!commandExists("docker")) {
    return;
  }
  const ps = spawnSync(
    "docker",
    [
      "compose",
      "--project-directory",
      mailcowRoot,
      "-f",
      path.join(mailcowRoot, "docker-compose.yml"),
      "ps",
      "--status",
      "running",
      "-q",
      "nginx-mailcow",
    ],
    { stdio: "pipe", encoding: "utf8" },
  );
  if ((ps.stdout ?? "").trim().length === 0) {
    return;
  }
  console.info("TLS: restarting nginx-mailcow…");
  run("docker", [
    "compose",
    "--project-directory",
    mailcowRoot,
    "-f",
    path.join(mailcowRoot, "docker-compose.yml"),
    "restart",
    "nginx-mailcow",
  ]);
}

export function ensureMailcowDevCerts() {
  if (!existsSync(mailcowDir)) {
    console.warn("mailcow-dockerized is missing — skip TLS setup (run bootstrap first).");
    return;
  }

  const hostname = readHostname();
  ensureSkipLetsEncrypt();

  if (!certsAreFresh(hostname)) {
    const usedMkcert = commandExists("mkcert") && generateWithMkcert(hostname);
    if (!usedMkcert) {
      generateWithOpenssl(hostname);
    }
  } else {
    console.info(`TLS: reusing cached dev certificate for ${hostname}`);
  }

  const { certFile, keyFile } = certPathsForHostname(hostname);
  installToMailcowSsl(certFile, keyFile);
  restartNginxIfRunning();
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  ensureMailcowDevCerts();
}
