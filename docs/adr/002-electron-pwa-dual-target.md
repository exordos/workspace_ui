# ADR-002: Electron + PWA dual-target architecture

**Date**: 2026-03
**Status**: accepted

## Context

The application must work as a desktop app (Windows, macOS, Linux) and as a web application (browser + PWA). A single React codebase for both targets.

## Options

1. **Tauri** — Rust backend, smaller size, but young ecosystem
2. **Electron** — mature ecosystem, electron-builder, auto-updater
3. **PWA only** — no native access to FS, OS-level notifications

## Decision

Electron 35 for desktop versions + PWA for the web version. Shared React code in `packages/web/`.

- `ELECTRON=1` at build time disables PWA (service worker, manifest)
- HashRouter for Electron (file:// protocol), BrowserRouter for web
- Unified notification service: Electron IPC vs Web Notifications API
- `contextIsolation: true`, `sandbox: true` — security hardening

## Consequences

- Positive: single codebase for both targets, native notifications, auto-update
- Negative: Electron bundle size (~150MB), Chromium duplication
- Risks: Electron security (mitigation: CSP, sandbox, contextIsolation)
