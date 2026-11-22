import { isElectron } from "~/shared/lib/electron";
import { isValidUrl } from "~/shared/lib/validation";

/**
 * Resolves realm-relative icon URLs.
 * In the browser, same-origin URLs are blocked to avoid Basic Auth prompts on `<img>`.
 * Electron serves the app from `file://`; same-origin icons are safe to load there.
 */
export function resolveLoginIconUrl(realmBase: string, icon: string): string {
  const trimmedIcon = icon.trim();
  if (trimmedIcon.length === 0) return "";

  const normalizedBase = realmBase.trim().replace(/\/+$/, "");
  if (!isValidUrl(normalizedBase)) return "";

  try {
    const baseUrl = new URL(`${normalizedBase}/`);
    const resolvedUrl = new URL(trimmedIcon, baseUrl);
    const resolved = resolvedUrl.toString();
    if (!isValidUrl(resolved)) return "";

    if (resolvedUrl.origin === baseUrl.origin && !isElectron()) {
      return "";
    }

    return resolved;
  } catch {
    return "";
  }
}
