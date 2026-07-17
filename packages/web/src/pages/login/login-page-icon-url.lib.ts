import { isElectron } from "~/shared/lib/electron";
import { parsePublicOrganizationUrlUrn } from "~/shared/lib/organization-branding";
import { isValidUrl } from "~/shared/lib/validation";

/**
 * Resolves realm-relative icon URLs.
 * In the browser, same-origin URLs are blocked to avoid browser credential prompts on `<img>`.
 * Explicit HTTPS `urn:url:` assets are anonymous by contract and safe to load before login.
 * Electron serves the app from `file://`; other same-origin icons are safe to load there.
 */
export function resolveLoginIconUrl(realmBase: string, icon: string): string {
  const trimmedIcon = icon.trim();
  if (trimmedIcon.length === 0) return "";
  const publicUrl = parsePublicOrganizationUrlUrn(trimmedIcon);
  if (trimmedIcon.toLowerCase().startsWith("urn:url:") && publicUrl == null) {
    return "";
  }

  const normalizedBase = realmBase.trim().replace(/\/+$/, "");
  if (!isValidUrl(normalizedBase)) return "";

  try {
    const baseUrl = new URL(`${normalizedBase}/`);
    const resolvedUrl = new URL(publicUrl ?? trimmedIcon, baseUrl);
    const resolved = resolvedUrl.toString();
    if (!isValidUrl(resolved)) return "";

    if (resolvedUrl.origin === baseUrl.origin && publicUrl == null && !isElectron()) {
      return "";
    }

    return resolved;
  } catch {
    return "";
  }
}
