// Базовые URL для резолва inline media из сообщений Zulip в абсолютные https URL.
//
// В Electron shell приложение может работать из `file://`,
// и тогда root-relative пути `/user_uploads/...` или `/external_content/...`
// иначе превратятся в `file:///...`.
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "~/shared/api/zulip-realm.internal";
import { WORKSPACE_ORIGIN } from "~/shared/config/constants";
import { env } from "~/shared/lib/env";

function getMessageRealmSiteBase(): string | undefined {
  const siteOnly = (site: string): string => site.trim().replace(/\/+$/, "");
  const realm = getRealmBaseUrl();
  if (realm) {
    const site = normalizeRealmSiteOriginForUploads(realm);
    return site !== "" ? siteOnly(site) : undefined;
  }
  if (WORKSPACE_ORIGIN) {
    const site = normalizeRealmSiteOriginForUploads(WORKSPACE_ORIGIN);
    return site !== "" ? siteOnly(site) : undefined;
  }
  return undefined;
}

export function getMessageRealmBaseUrl(): string | undefined {
  return getMessageRealmSiteBase();
}

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
  const site = getMessageRealmSiteBase();
  if (realm && site) {
    return withPrefixForRealm(realm, site);
  }
  if (site != null) {
    return withPrefixForWorkspaceOrigin(site);
  }
  return undefined;
}
