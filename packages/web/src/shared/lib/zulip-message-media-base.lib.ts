/**
 * Base URL for resolving Zulip message inline media (`/user_uploads/`) to absolute https URLs.
 *
 * In Electron the app shell may be `file://`; root-relative `/user_uploads/...` would otherwise
 * resolve to `file:///user_uploads/...`. Callers (e.g. {@link sanitizeHtml}) must pass this base
 * when rewriting message HTML.
 */
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "~/shared/api/zulip-realm.internal";
import { WORKSPACE_ORIGIN } from "~/shared/config/constants";
import { env } from "~/shared/lib/env";

export function getMessageImagesBaseUrl(): string | undefined {
  const prefix = env.USER_UPLOADS_PATH_PREFIX;
  const siteOnly = (site: string): string => site.trim().replace(/\/+$/, "");

  const withPrefixForWorkspaceOrigin = (site: string): string =>
    prefix !== "" ? appendUserUploadsPathPrefix(site, prefix) : siteOnly(site);

  const withPrefixForRealm = (realmBase: string, site: string): string => {
    const base = siteOnly(site);
    if (prefix === "") return base;
    if (shouldApplyUserUploadsPathPrefixForRealmBase(realmBase, site)) {
      return appendUserUploadsPathPrefix(base, prefix);
    }
    return base;
  };

  const realm = getRealmBaseUrl();
  if (realm) {
    const site = normalizeRealmSiteOriginForUploads(realm);
    return site !== "" ? withPrefixForRealm(realm, site) : undefined;
  }
  if (WORKSPACE_ORIGIN) {
    const site = normalizeRealmSiteOriginForUploads(WORKSPACE_ORIGIN);
    return site !== "" ? withPrefixForWorkspaceOrigin(site) : undefined;
  }
  return undefined;
}
