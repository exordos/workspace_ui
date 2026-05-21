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
import { WORKSPACE_GATEWAY_V1_PATH } from "~/shared/config/workspace-api-layout";

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
  const siteOnly = (site: string): string => site.trim().replace(/\/+$/, "");

  const withPrefixForWorkspaceOrigin = (site: string): string =>
    appendUserUploadsPathPrefix(site, WORKSPACE_GATEWAY_V1_PATH);

  const withPrefixForRealm = (realmBase: string, site: string): string => {
    const base = siteOnly(site);
    if (shouldApplyUserUploadsPathPrefixForRealmBase(realmBase, site)) {
      return appendUserUploadsPathPrefix(base, WORKSPACE_GATEWAY_V1_PATH);
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
