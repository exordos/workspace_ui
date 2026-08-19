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
// The TLS edge preserves the user-selected Host. Match every non-empty Host so
// pointing DNS at that edge is enough; malformed or missing hosts still miss.
if (vhost?.domains?.length !== 1 || vhost.domains[0] !== "~^.+$") {
  throw new Error("workspace_http must accept every non-empty hostname");
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

const defaultSite = manifest.resources["$core.config.configs"]?.workspace_ui_lb_default_site;
if (!defaultSite) {
  throw new Error("Workspace UI manifest must own the load-balancer default site");
}
if (
  defaultSite.target?.kind !== "node_set" ||
  defaultSite.target.node_set !== "$core.network.lb.$workspace_ui_lb:uuid"
) {
  throw new Error("Workspace UI load-balancer default site must target its node set");
}
if (defaultSite.path !== "/etc/nginx/sites-enabled/default") {
  throw new Error("Workspace UI load-balancer default site must replace the packaged site");
}
if (defaultSite.on_change?.command !== "nginx -t && systemctl reload nginx") {
  throw new Error("Workspace UI load-balancer default site must validate and reload nginx");
}

const defaultSiteContent = defaultSite.body?.content ?? "";
if (!defaultSiteContent.includes("listen 80 default_server")) {
  throw new Error("Workspace UI load-balancer default site must keep the port 80 catch-all");
}
if (/listen\s+(?:\[::\]:)?443\b|ssl_certificate/.test(defaultSiteContent)) {
  throw new Error("Workspace UI load-balancer default site must not configure TLS");
}

const webAction = routes.workspace_web?.condition?.actions?.[0];
if (webAction?.kind !== "local_dir_download" || !webAction.url.endsWith("/workspace-ui.tar.zst")) {
  throw new Error("workspace_web must download the workspace-ui.tar.zst artifact");
}

const apiAction = routes.workspace_api?.condition?.actions?.[0];
if (apiAction?.kind !== "backend") {
  throw new Error("workspace_api must proxy requests to the backend pool");
}

const apiModifiers = routes.workspace_api?.condition?.modifiers ?? [];
const automaticHeaders = apiModifiers.find((modifier) => modifier.kind === "auto_header");
if (!automaticHeaders?.headers?.includes("Host")) {
  throw new Error("workspace_api must forward nginx's normalized request host");
}

const forwardedProto = apiModifiers.find(
  (modifier) => modifier.kind === "set_header" && modifier.name === "X-Forwarded-Proto",
);
if (forwardedProto?.value !== "https") {
  throw new Error("workspace_api must identify the TLS edge scheme as https");
}

console.log(`Validated ${manifestPath}`);
