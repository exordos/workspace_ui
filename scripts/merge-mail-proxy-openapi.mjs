#!/usr/bin/env node
/**
 * Merges mail-proxy OpenAPI paths into workspace.openapi.json under /mail-proxy prefix.
 * Run: node scripts/merge-mail-proxy-openapi.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = join(root, "packages/workspace-api/openapi/workspace.openapi.json");
const mailPath = join(root, "packages/mail-api/openapi/mail-proxy.openapi.json");

const workspace = JSON.parse(readFileSync(workspacePath, "utf8"));
const mail = JSON.parse(readFileSync(mailPath, "utf8"));

workspace.paths ??= {};
const mailProxyPaths = new Set(
  Object.keys(mail.paths ?? {}).map((path) => `/mail-proxy${path}`),
);
for (const path of Object.keys(workspace.paths)) {
  if (path.startsWith("/mail-proxy/v1/mail/") && !mailProxyPaths.has(path)) {
    delete workspace.paths[path];
  }
}
for (const [path, item] of Object.entries(mail.paths ?? {})) {
  workspace.paths[`/mail-proxy${path}`] = item;
}

const mailSchemas = mail.components?.schemas ?? {};
const mailResponses = mail.components?.responses ?? {};
workspace.components ??= {};
workspace.components.schemas ??= {};
workspace.components.responses ??= {};
for (const [name, schema] of Object.entries(mailSchemas)) {
  if (workspace.components.schemas[name] == null) {
    workspace.components.schemas[name] = schema;
  }
}
for (const [name, response] of Object.entries(mailResponses)) {
  if (workspace.components.responses[name] == null) {
    workspace.components.responses[name] = response;
  }
}

writeFileSync(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`);
console.log(`Merged ${Object.keys(mail.paths ?? {}).length} mail-proxy paths into workspace.openapi.json`);
