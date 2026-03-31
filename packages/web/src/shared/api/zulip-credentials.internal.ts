/**
 * Credential helpers for cross-instance Zulip API calls. Internal to zulip API modules.
 */
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { guard } from "~/shared/lib/guards";
import { normalizeRealm } from "./zulip-realm.internal";
import type { ZulipCredentials } from "./zulip.types";

export function getAuthValueForCredentials(credentials: ZulipCredentials): string {
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (!authValue) {
    throw new Error(t("app.noInstance"));
  }
  return authValue;
}

export function getValidatedCredentialsRealm(credentials: ZulipCredentials, context: string): string {
  return normalizeRealm(guard.url(credentials.realm, `${context}.realm`));
}
