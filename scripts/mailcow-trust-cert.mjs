#!/usr/bin/env node
/**
 * Adds Mailcow dev certificate to the macOS login keychain as trusted (dev only).
 *
 * Usage: npm run dev:mailcow:trust-cert
 * Requires: mailcow bootstrap + dev certs generated first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mailcowConf = path.join(repoRoot, "docker", "mailcow", "mailcow-dockerized", "mailcow.conf");
const certFile = path.join(repoRoot, "docker", "mailcow", "mailcow-dockerized", "data", "assets", "ssl", "cert.pem");

function readHostname() {
  if (!existsSync(mailcowConf)) {
    return "mail.example.test";
  }
  const match = /^MAILCOW_HOSTNAME=(.+)$/m.exec(readFileSync(mailcowConf, "utf8"));
  return match?.[1]?.trim() || "mail.example.test";
}

if (process.platform !== "darwin") {
  console.error("dev:mailcow:trust-cert is supported on macOS only.");
  console.error("On Linux, trust the cert via your browser or system CA store.");
  console.error("Prefer mkcert: brew install mkcert && mkcert -install");
  process.exit(1);
}

if (!existsSync(certFile)) {
  console.error(`Certificate not found: ${certFile}`);
  console.error("Run: npm run dev:mailcow:certs");
  process.exit(1);
}

const hostname = readHostname();
console.info(`Trusting dev certificate for ${hostname}…`);

const result = spawnSync(
  "security",
  ["add-trusted-cert", "-r", "trustRoot", "-p", "ssl", "-k", `${process.env.HOME}/Library/Keychains/login.keychain-db`, certFile],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.info(`Done. Reload https://${hostname}/admin in your browser.`);
