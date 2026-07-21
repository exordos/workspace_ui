#!/usr/bin/env bash

# Copyright 2026 Genesis Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may
# not use this file except in compliance with the License.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DIST_PATH="$PROJECT_ROOT/packages/web/dist"
ARTIFACT_PATH="$PROJECT_ROOT/packages/web/workspace-ui.tar.zst"
SOURCE_REF="${WORKSPACE_UI_REF:-${GITHUB_REF_NAME:-$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)}}"
SOURCE_SHA="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$PROJECT_ROOT" show -s --format=%ct HEAD)}"

(
    cd "$PROJECT_ROOT"
    VITE_APP_VERSION="${VITE_APP_VERSION:-$SOURCE_SHA}" \
        VITE_MESSENGER_ONLY=true \
        npm run build --workspace=web
)

node - "$DIST_PATH" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [distPath] = process.argv.slice(2);
const index = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(distPath, "manifest.webmanifest"), "utf8"),
);

if (!index.includes('src="/assets/')) {
  throw new Error("bundle assets do not use the root path");
}
if (manifest.scope !== "/" || manifest.start_url !== "/") {
  throw new Error("PWA manifest does not use the root path");
}
if (!fs.existsSync(path.join(distPath, "pwa-512x512.png"))) {
  throw new Error("PWA organization emblem is missing");
}
NODE

cp "$DIST_PATH/pwa-512x512.png" "$DIST_PATH/logo-512x512.png"
printf 'ref=%s\ncommit=%s\n' "$SOURCE_REF" "$SOURCE_SHA" \
    > "$DIST_PATH/build-ref.txt"

rm -f "$ARTIFACT_PATH"
tar \
    --sort=name \
    --mtime="@$SOURCE_DATE_EPOCH" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    --zstd \
    -cf "$ARTIFACT_PATH" \
    -C "$DIST_PATH" \
    .

printf 'Built %s\n' "$ARTIFACT_PATH"
