import { getRealmBaseUrl } from "./zulip-client.internal";
import type { RealmEmoji } from "./zulip.types";

function resolveRealmRelativeUrl(path: string): string {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return "";
  }
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }
  const base = getRealmBaseUrl();
  if (!base) {
    return "";
  }
  return `${base}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function normalizeRealmEmojiId(id: string | number | undefined): string {
  if (typeof id === "string") {
    return id.trim();
  }
  if (typeof id === "number") {
    return String(id);
  }
  return "";
}

interface RawRealmEmojiValue {
  id?: string | number;
  name?: string;
  source_url?: string;
  deactivated?: boolean;
}

export function normalizeRealmEmojiValue(value: unknown): RealmEmoji | null {
  if (typeof value !== "object" || value == null) {
    return null;
  }
  const record = value as RawRealmEmojiValue;
  if (record.deactivated === true) {
    return null;
  }
  const id = normalizeRealmEmojiId(record.id);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const sourceUrl = typeof record.source_url === "string" ? record.source_url.trim() : "";
  if (!id || !name || !sourceUrl) {
    return null;
  }
  const imgUrl = resolveRealmRelativeUrl(sourceUrl);
  if (!imgUrl) {
    return null;
  }
  return {
    id,
    names: [name],
    imgUrl,
  };
}

export function normalizeRealmEmojiMap(
  emoji: Record<string, RawRealmEmojiValue> | null | undefined,
): RealmEmoji[] {
  if (emoji == null || typeof emoji !== "object" || Array.isArray(emoji)) {
    return [];
  }
  const normalized: RealmEmoji[] = [];
  for (const value of Object.values(emoji)) {
    const entry = normalizeRealmEmojiValue(value);
    if (entry) {
      normalized.push(entry);
    }
  }
  return normalized;
}
