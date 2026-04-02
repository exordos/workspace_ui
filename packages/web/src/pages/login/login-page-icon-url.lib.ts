import { isValidUrl } from "~/shared/lib/validation";

/** Resolves realm-relative icon URLs; blocks same-origin URLs to avoid Basic Auth prompts on `<img>`. */
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

    if (resolvedUrl.origin === baseUrl.origin) {
      return "";
    }

    return resolved;
  } catch {
    return "";
  }
}
