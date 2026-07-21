// Copyright 2026 Genesis Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const outputRoot = path.resolve(process.argv[2] ?? "output/exordos-elements");
const elementRoot = path.join(outputRoot, "workspace_ui");
const versions = fs
  .readdirSync(elementRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (versions.length !== 1) {
  throw new Error(`Expected one built workspace_ui version, found ${versions.length}`);
}

const manifestPath = path.join(elementRoot, versions[0], "manifests", "workspace_ui.yaml");
const manifest = parse(fs.readFileSync(manifestPath, "utf8"));
const vhostKey = Object.keys(manifest.resources).find((key) => key.endsWith(".vhosts"));
const routesKey = Object.keys(manifest.resources).find((key) => key.endsWith(".routes"));

if (!vhostKey || !routesKey) {
  throw new Error("Workspace UI manifest has no load-balancer vhost or routes");
}

const vhost = manifest.resources[vhostKey].workspace_http;
if (vhost?.domains?.length !== 1 || vhost.domains[0] === "_") {
  throw new Error("workspace_http must use the configured public domain");
}

const routes = manifest.resources[routesKey];
for (const [name, route] of Object.entries(routes)) {
  if ("actions" in route || "modifiers" in route) {
    throw new Error(`${name} actions and modifiers must be nested under condition`);
  }
  if (!Array.isArray(route.condition?.actions) || route.condition.actions.length === 0) {
    throw new Error(`${name} condition must contain at least one action`);
  }
}

const webAction = routes.workspace_web?.condition?.actions?.[0];
if (webAction?.kind !== "local_dir_download" || !webAction.url.endsWith("/workspace-ui.tar.zst")) {
  throw new Error("workspace_web must download the workspace-ui.tar.zst artifact");
}

const apiAction = routes.workspace_api?.condition?.actions?.[0];
if (apiAction?.kind !== "backend") {
  throw new Error("workspace_api must proxy requests to the backend pool");
}

console.log(`Validated ${manifestPath}`);
