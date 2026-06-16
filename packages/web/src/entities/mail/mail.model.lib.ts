/**
 * Mail store helpers — session invalidation and localized API errors.
 */

import { t } from "~/i18n/i18n";
import { clearMailSessionFromStorage } from "./mail-session-storage.lib";
import { isMailUnauthorizedError } from "./mail.lib";
export function resolveMailActionError(error: unknown, fallbackKey: string): string {
  if (isMailUnauthorizedError(error)) {
    return t("mail.sessionExpired");
  }
  return error instanceof Error ? error.message : t(fallbackKey);
}

export interface MailSessionInvalidatorDeps {
  resetMailData: () => void;
}

export function invalidateMailSessionIfUnauthorized(
  error: unknown,
  deps: MailSessionInvalidatorDeps,
): boolean {
  if (!isMailUnauthorizedError(error)) return false;
  clearMailSessionFromStorage();
  deps.resetMailData();
  return true;
}
