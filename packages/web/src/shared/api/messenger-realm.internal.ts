import { env } from "~/shared/lib/env";

/**
 * organization realm URL normalization. Internal to shared/api messenger modules.
 */
export function normalizeRealm(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/workspace\/v1\/messenger$/i, "")
    .replace(/\/+$/, "");
}

/**
 * Web origin for the messenger API static routes such as `/user_uploads/`.
 * Strips the canonical Workspace gateway tails repeatedly so media paths can be
 * resolved from the organization origin.
 */
export function normalizeRealmSiteOriginForUploads(realmBaseAfterApiStrip: string): string {
  let r = realmBaseAfterApiStrip.trim().replace(/\/+$/, "");
  if (r === "") return "";

  const restTail = env.WORKSPACE_REST_API_PATH;
  const suffixes = Array.from(
    new Set(["/api/workspace/v1", restTail].filter((s) => s.length > 0)),
  ).sort((a, b) => b.length - a.length);

  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of suffixes) {
      if (r.endsWith(suf)) {
        r = r.slice(0, -suf.length).replace(/\/+$/, "");
        changed = true;
        break;
      }
    }
  }
  return r.replace(/\/+$/, "");
}

/** Joins site origin with optional uploads prefix; avoids duplicating if the site already ends with that prefix. */
export function appendUserUploadsPathPrefix(site: string, prefix: string): string {
  const s = site.trim().replace(/\/+$/, "");
  let p = prefix.trim().replace(/\/+$/, "");
  if (p === "") return s;
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  if (s.endsWith(p)) {
    return s;
  }
  return `${s}${p}`;
}

/**
 * Whether to append {@link env.USER_UPLOADS_PATH_PREFIX} when building upload URLs from a Workspace
 * instance realm. Prefix matches gateway mounts; after stripping `/api/workspace/v1` from the stored
 * realm we must re-append it. A canonical realm host (`https://chat.example.com`) already serves
 * `/user_uploads/` at the origin — no prefix unless {@link env.USER_UPLOADS_PREFIX_ON_REALM}.
 */
export function shouldApplyUserUploadsPathPrefixForRealmBase(
  realmBaseAfterApiStrip: string,
  uploadSiteOrigin: string,
): boolean {
  const realm = realmBaseAfterApiStrip.trim().replace(/\/+$/, "");
  const site = uploadSiteOrigin.trim().replace(/\/+$/, "");
  if (realm === "" || site === "") return false;
  if (realm !== site) return true;
  return env.USER_UPLOADS_PREFIX_ON_REALM;
}
