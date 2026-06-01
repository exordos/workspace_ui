/**
 * Fetches avatar images with auth headers for private Zulip realms / gateways.
 *
 * Usage:
 *   import { fetchAvatarBlob } from "~/shared/lib/avatar-blob-fetch.lib";
 */
import { buildAuthHeader } from "~/shared/lib/auth-guard";

/** Downloads an avatar image as a Blob (best-effort). */
export async function fetchAvatarBlob(absoluteUrl: string): Promise<Blob | null> {
  const trimmed = absoluteUrl.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return null;

  try {
    const response = await fetch(trimmed, {
      credentials: "include",
      headers: buildAuthHeader(),
    });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
