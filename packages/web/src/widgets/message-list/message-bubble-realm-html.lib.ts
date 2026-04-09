import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
} from "~/shared/api/zulip-realm.internal";
import { WORKSPACE_ORIGIN } from "~/shared/config/constants";
import { env } from "~/shared/lib/env";

/**
 * Dev-only: same origin as the Vite server so `/user_uploads/...` hits the dev proxy (see
 * `vite.config.ts` server.preview `proxy`).
 */
function getViteDevSameOriginUploadsBaseUrl(): string | undefined {
  if (!env.DEV || env.MODE !== "development" || typeof window === "undefined") {
    return undefined;
  }
  return window.location.origin;
}

/**
 * Base URL for rewriting message `<img src>` / upload links to absolute URLs.
 * Starts from the realm site origin (gateway suffix stripped). Optional
 * {@link env.USER_UPLOADS_PATH_PREFIX} is appended when uploads live under a subpath.
 *
 * In Vite dev (`MODE === "development"`), uses {@link getViteDevSameOriginUploadsBaseUrl} so
 * `/user_uploads/` resolves to the dev origin and is proxied upstream (avoids CORS on the realm).
 */
export function getMessageImagesBaseUrl(): string | undefined {
  const viteDevBase = getViteDevSameOriginUploadsBaseUrl();
  if (viteDevBase !== undefined) {
    return viteDevBase;
  }

  const prefix = env.USER_UPLOADS_PATH_PREFIX;
  const withPrefix = (site: string): string =>
    prefix !== "" ? appendUserUploadsPathPrefix(site, prefix) : site.trim().replace(/\/+$/, "");

  const realm = getRealmBaseUrl();
  if (realm) {
    const site = normalizeRealmSiteOriginForUploads(realm);
    return site !== "" ? withPrefix(site) : undefined;
  }
  if (WORKSPACE_ORIGIN) {
    const site = normalizeRealmSiteOriginForUploads(WORKSPACE_ORIGIN);
    return site !== "" ? withPrefix(site) : undefined;
  }
  return undefined;
}
