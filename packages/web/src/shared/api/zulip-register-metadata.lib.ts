/**
 * Parses selected metadata fields from Zulip POST /api/v1/register responses.
 */
import type { ZulipServerThumbnailFormat } from "./zulip.types";

/** Validates and returns `server_thumbnail_formats` from register JSON (Zulip 9.0+). */
export function parseServerThumbnailFormats(
  data: unknown,
): ZulipServerThumbnailFormat[] | undefined {
  if (data == null || !Array.isArray(data)) {
    return undefined;
  }
  const out: ZulipServerThumbnailFormat[] = [];
  for (const item of data) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.format !== "string") continue;
    if (typeof o.max_width !== "number" || typeof o.max_height !== "number") continue;
    if (typeof o.animated !== "boolean") continue;
    out.push({
      name: o.name,
      max_width: o.max_width,
      max_height: o.max_height,
      format: o.format,
      animated: o.animated,
    });
  }
  return out.length > 0 ? out : undefined;
}
