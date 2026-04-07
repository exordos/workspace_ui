import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { WORKSPACE_ORIGIN, WORKSPACE_UPLOADS_ORIGIN } from "~/shared/config/constants";

/** Base URL for message images (uploads): when realm === workspace, use origin + api/v1. */
export function getMessageImagesBaseUrl(): string | undefined {
  const realm = getRealmBaseUrl();
  if (WORKSPACE_ORIGIN && realm === WORKSPACE_ORIGIN && WORKSPACE_UPLOADS_ORIGIN) {
    return WORKSPACE_UPLOADS_ORIGIN;
  }
  return realm || WORKSPACE_UPLOADS_ORIGIN || undefined;
}
