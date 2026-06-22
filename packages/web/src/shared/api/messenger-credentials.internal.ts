/**
 * Credential helpers for cross-instance Messenger API calls. Internal to messenger API modules.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import { normalizeRealm } from "./messenger-realm.internal";
import type { MessengerCredentials } from "./messenger.types";

export function getAuthValueForCredentials(credentials: MessengerCredentials): string {
  const accessToken = credentials.accessToken.trim();
  if (accessToken.length === 0) {
    throw new Error(t("app.noInstance"));
  }
  return `Bearer ${accessToken}`;
}

export function getValidatedCredentialsRealm(
  credentials: MessengerCredentials,
  context: string,
): string {
  return normalizeRealm(guard.url(credentials.realm, `${context}.realm`));
}
