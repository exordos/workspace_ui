/**
 * Workspace REST API origin helpers: login URL → origin, and organization realm → origin.
 *
 * Login stores the origin of the URL the user typed (`workspaceOrgOriginFromLoginServerUrlInput`).
 * When that field is missing (legacy data), `workspaceOrgApiOriginFromRealmRoot`
 * falls back to the canonical organization realm origin instead of inventing a sibling host.
 */

/** Workspace API origin from the server URL the user typed at login (before Workspace canonical realm). */
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

/** Workspace HTTP API origin for legacy API calls with no stored Workspace origin. */
export function workspaceOrgApiOriginFromRealmRoot(realmRoot: string): string {
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
  return url.origin;
}
