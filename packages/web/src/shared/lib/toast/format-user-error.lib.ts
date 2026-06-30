/**
 * Maps thrown API/runtime errors to safe, localized user-facing strings for toasts.
 */

import { t } from "~/i18n/i18n";
import { WorkspaceApiHttpError } from "~/shared/api/workspace-api-error";
import { isLikelyNetworkError } from "~/shared/lib/connection-health";

const INTERNAL_ERROR_PREFIXES = ["Workspace API error:"];

function isLikelyUserFacingMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 240) {
    return false;
  }
  if (INTERNAL_ERROR_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return false;
  }
  if (/apiKey|password|authorization/i.test(trimmed)) {
    return false;
  }
  return true;
}

function messageFromWorkspaceApiError(err: WorkspaceApiHttpError): string {
  if (err.status >= 500) {
    return t("app.error");
  }
  return t("app.errorStatus", { status: String(err.status) });
}

/**
 * Returns a localized string safe to show in UI (no credentials, no raw stack traces).
 */
export function formatUserFacingError(err: unknown, fallbackKey: string): string {
  if (isLikelyNetworkError(err)) {
    return t("app.networkError");
  }
  if (err instanceof WorkspaceApiHttpError) {
    return messageFromWorkspaceApiError(err);
  }
  if (err instanceof Error && isLikelyUserFacingMessage(err.message)) {
    return err.message;
  }
  return t(fallbackKey);
}
