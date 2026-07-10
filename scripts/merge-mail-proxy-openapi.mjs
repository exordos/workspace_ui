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
for (const [path, item] of Object.entries(mail.paths ?? {})) {
  workspace.paths[`/mail-proxy${path}`] = item;
}

const mailSchemas = mail.components?.schemas ?? {};
workspace.components ??= {};
workspace.components.schemas ??= {};
for (const [name, schema] of Object.entries(mailSchemas)) {
  if (workspace.components.schemas[name] == null) {
    workspace.components.schemas[name] = schema;
  }
}

writeFileSync(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`);
console.log(`Merged ${Object.keys(mail.paths ?? {}).length} mail-proxy paths into workspace.openapi.json`);
