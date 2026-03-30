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
