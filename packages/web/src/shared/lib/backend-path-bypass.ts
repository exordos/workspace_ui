/**
 * Escape hatch: if the SPA shell loads on a Zulip/balancer backend path
 * (`/accounts/...`, `/api/...`, etc.), bypass the service worker and reload
 * through the network so the balancer can answer.
 *
 * This handles two real-world scenarios:
 * 1. An older service worker (from a build before `navigateFallbackDenylist`)
 *    still intercepts navigation and returns the cached `index.html`.
 * 2. The production balancer is misconfigured and serves `index.html` for
 *    backend paths — we surface this clearly with a hint instead of silently
 *    rendering the SPA login page.
 *
 * Runs synchronously before React mounts to fail fast.
 */

import { BACKEND_BYPASS_PATH_PREFIXES } from "~/shared/config/backend-bypass-paths";

const BYPASS_QUERY_FLAG = "__spa_bypass__";

function pathMatchesBackend(pathname: string): boolean {
  return BACKEND_BYPASS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function alreadyAttempted(search: string): boolean {
  return new URLSearchParams(search).has(BYPASS_QUERY_FLAG);
}

function buildReloadUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set(BYPASS_QUERY_FLAG, "1");
  return url.toString();
}

function renderBalancerMisconfigHint(pathname: string): void {
  const root = document.getElementById("root");
  if (root == null) return;
  const message =
    `Balancer misconfiguration: ${pathname} returned the SPA shell instead of the Zulip backend. ` +
    `Configure your reverse proxy to forward backend paths (${BACKEND_BYPASS_PATH_PREFIXES.join(", ")}) ` +
    `BEFORE the SPA history fallback. See deploy/nginx/workspace-same-origin.conf.example.`;
  root.textContent = message;
}

async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* best-effort; reload below will still go through the network */
  }
}

/**
 * If the SPA shell is loading on a backend path, unregister the service worker
 * and reload bypassing the SW cache. Returns `true` when a reload was triggered
 * (caller should NOT continue bootstrapping React).
 */
export function bypassSpaForBackendPath(): boolean {
  if (typeof window === "undefined") return false;
  const { pathname, search } = window.location;
  if (!pathMatchesBackend(pathname)) {
    return false;
  }

  if (alreadyAttempted(search)) {
    renderBalancerMisconfigHint(pathname);
    return true;
  }

  const reloadUrl = buildReloadUrl();
  void unregisterServiceWorkers().finally(() => {
    window.location.replace(reloadUrl);
  });
  return true;
}
