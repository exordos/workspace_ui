/**
 * Workspace server discovery for the Messenger gateway.
 */
import { MESSENGER_API_PATH } from "~/shared/config/workspace-api-layout";
import { loggedFetch } from "~/shared/lib/logged-fetch.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type { MessengerServerSettings } from "./messenger.types";

/**
 * Fetches server settings (GET /api/messenger/v1/server_settings). No auth required.
 * Used on login page to show organization icon and name.
 */
export async function fetchServerSettings(
  realmUrl: string,
): Promise<MessengerServerSettings | null> {
  try {
    if (!isValidRealmUrl(realmUrl)) {
      return null;
    }
    const parsedRealm = new URL(realmUrl.trim());
    const normalizedPath = parsedRealm.pathname
      .replace(/\/+$/, "")
      .replace(/\/api\/messenger\/v1$/i, "")
      .replace(/\/api$/, "");
    const base = `${parsedRealm.origin}${normalizedPath}`.replace(/\/+$/, "");
    if (!base) return null;
    const url = `${base}${MESSENGER_API_PATH}/server_settings`;
    const res = await loggedFetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      realm_name?: string;
      realm_icon?: string;
      realm_uri?: string;
      realm_url?: string;
    };
    let realmUrlRaw = "";
    if (typeof data.realm_url === "string" && data.realm_url.trim() !== "") {
      realmUrlRaw = data.realm_url.trim();
    } else if (typeof data.realm_uri === "string") {
      realmUrlRaw = data.realm_uri.trim();
    }
    return {
      realm_name: data.realm_name ?? "",
      realm_icon: data.realm_icon ?? "",
      realm_uri: realmUrlRaw,
      realm_url: realmUrlRaw,
    };
  } catch {
    return null;
  }
}
