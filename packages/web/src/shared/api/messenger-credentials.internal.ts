/**
 * Credential helpers for cross-instance Messenger API calls. Internal to messenger API modules.
 */
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { guard } from "~/shared/lib/guards";
import { normalizeRealm } from "./messenger-realm.internal";
import type { MessengerCredentials } from "./messenger.types";

export function getAuthValueForCredentials(credentials: MessengerCredentials): string {
  const authValue = getBasicAuthValue({
    login: credentials.login,
    apiKey: credentials.apiKey,
  });
  if (!authValue) {
    throw new Error(t("app.noInstance"));
  }
  return authValue;
}

export function getValidatedCredentialsRealm(
  credentials: MessengerCredentials,
  context: string,
): string {
  return normalizeRealm(guard.url(credentials.realm, `${context}.realm`));
}
