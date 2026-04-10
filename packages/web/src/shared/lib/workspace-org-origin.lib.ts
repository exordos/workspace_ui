/**
 * Workspace REST API origin helpers: login URL → origin, and Zulip realm → gateway host heuristics.
 *
 * Login stores the origin of the URL the user typed (`workspaceOrgOriginFromLoginServerUrlInput`).
 * When that field is missing (legacy data), `workspaceOrgApiOriginFromZulipRealmRoot` maps
 * `zulip.*` → `workspace.*` like Vite `deriveLegacyWorkspaceOrigin`; otherwise the realm origin is used.
 */

/** Workspace API origin from the server URL the user typed at login (before Zulip canonical realm). */
export function workspaceOrgOriginFromLoginServerUrlInput(serverUrlInput: string): string {
  const base = serverUrlInput
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/i, "")
    .replace(/\/api$/i, "")
    .replace(/\/json$/i, "");
  if (base === "") {
    return "";
  }
  try {
    const url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
    return url.origin;
  } catch {
    return "";
  }
}

/** Workspace HTTP API origin for API calls (may differ from Zulip realm host). */
export function workspaceOrgApiOriginFromZulipRealmRoot(realmRoot: string): string {
  const trimmed = realmRoot.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return trimmed;
  }
  const host = url.hostname.toLowerCase();
  if (host.startsWith("zulip.")) {
    url.hostname = `workspace.${host.slice("zulip.".length)}`;
  }
  return url.origin;
}
