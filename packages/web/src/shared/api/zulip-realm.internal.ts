/**
 * Zulip realm URL normalization. Internal to shared/api zulip modules.
 */
import { env } from "~/shared/lib/env";

export function normalizeRealm(realm: string): string {
  let r = realm.trim().replace(/\/+$/, "");
  const apiPath = env.ZULIP_API_PATH;
  if (r.endsWith(apiPath)) {
    r = r.slice(0, -apiPath.length);
  } else if (r.endsWith("/api/v1")) {
    r = r.slice(0, -"/api/v1".length);
  } else if (r.endsWith("/api")) {
    r = r.slice(0, -"/api".length);
  }
  return r.replace(/\/+$/, "");
}

/**
 * Web origin for Zulip static routes such as `/user_uploads/`.
 * Strips Workspace gateway tails repeatedly: e.g. `WORKSPACE_REST_API_PATH` may be `/workspace`
 * while the realm URL ends with `/workspace/v1` — we must remove `/workspace/v1` first, not stop
 * after a non-matching `/workspace` check.
 */
export function normalizeRealmSiteOriginForUploads(realmBaseAfterApiStrip: string): string {
  let r = realmBaseAfterApiStrip.trim().replace(/\/+$/, "");
  if (r === "") return "";

  const restTail = env.WORKSPACE_REST_API_PATH;
  const suffixes = Array.from(
    new Set(["/workspace/v1", "/workspace", restTail].filter((s) => s.length > 0)),
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
