import rawStickerCatalog from "./sticker-catalog.json";
import { StickerCatalogValidationError } from "./sticker.repository";
import type {
  StickerAttribution,
  StickerCatalog,
  StickerCatalogAccessMode,
  StickerCatalogEntry,
  StickerFormat,
  StickerMediaMetadata,
  StickerRating,
  StickerSource,
} from "./sticker.types";

const WORKSPACE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GIPHY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const STICKER_FORMATS = new Set<StickerFormat>(["gif", "webp", "png"]);
const STICKER_RATINGS = new Set<StickerRating>(["g", "pg", "pg-13", "r"]);
const STICKER_ACCESS_MODES = new Set<StickerCatalogAccessMode>(["allowlist", "unrestricted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StickerCatalogValidationError(`Sticker catalog field '${key}' must be a string`);
  }
  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value == null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StickerCatalogValidationError(`Sticker catalog field '${key}' must be a string`);
  }
  return value.trim();
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new StickerCatalogValidationError(
      `Sticker catalog field '${key}' must be a string array`,
    );
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

function readPositiveNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new StickerCatalogValidationError(`Sticker catalog field '${key}' must be positive`);
  }
  return value;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new StickerCatalogValidationError(`Sticker catalog field '${key}' must be boolean`);
  }
  return value;
}

function parseSource(value: unknown): StickerSource {
  if (!isRecord(value) || value.provider !== "giphy") {
    throw new StickerCatalogValidationError("Sticker source provider must be 'giphy'");
  }
  const externalId = readRequiredString(value, "externalId");
  if (!GIPHY_ID_PATTERN.test(externalId)) {
    throw new StickerCatalogValidationError("Sticker source externalId is invalid");
  }
  return { provider: "giphy", externalId };
}

function parseMedia(value: unknown): StickerMediaMetadata {
  if (!isRecord(value)) {
    throw new StickerCatalogValidationError("Sticker media metadata is invalid");
  }
  const preferredFormat = readRequiredString(value, "preferredFormat");
  if (!STICKER_FORMATS.has(preferredFormat as StickerFormat)) {
    throw new StickerCatalogValidationError("Sticker preferredFormat is invalid");
  }
  return {
    animated: readBoolean(value, "animated"),
    width: readPositiveNumber(value, "width"),
    height: readPositiveNumber(value, "height"),
    aspectRatio: readPositiveNumber(value, "aspectRatio"),
    preferredFormat: preferredFormat as StickerFormat,
  };
}

function parseAttribution(value: unknown): StickerAttribution {
  if (!isRecord(value)) {
    throw new StickerCatalogValidationError("Sticker attribution is invalid");
  }
  return {
    provider: readRequiredString(value, "provider"),
    creator: readOptionalString(value, "creator"),
    pageUrl: readOptionalString(value, "pageUrl"),
  };
}

function parseEntry(value: unknown): StickerCatalogEntry {
  if (!isRecord(value)) {
    throw new StickerCatalogValidationError("Sticker catalog entry is invalid");
  }
  const id = readRequiredString(value, "id");
  if (!WORKSPACE_UUID_PATTERN.test(id)) {
    throw new StickerCatalogValidationError("Sticker id must be a Workspace UUID");
  }
  const rating = readRequiredString(value, "rating");
  if (!STICKER_RATINGS.has(rating as StickerRating)) {
    throw new StickerCatalogValidationError("Sticker rating is invalid");
  }
  return {
    id: id.toLowerCase(),
    source: parseSource(value.source),
    title: readRequiredString(value, "title"),
    alt: readRequiredString(value, "alt"),
    emoji: readStringArray(value, "emoji"),
    tags: readStringArray(value, "tags"),
    media: parseMedia(value.media),
    attribution: parseAttribution(value.attribution),
    rating: rating as StickerRating,
    active: readBoolean(value, "active"),
    blocked: readBoolean(value, "blocked"),
  };
}

export function parseStickerCatalog(value: unknown): StickerCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new StickerCatalogValidationError("Unsupported sticker catalog schemaVersion");
  }
  const catalogVersion = readRequiredString(value, "catalogVersion");
  const accessMode = readRequiredString(value, "accessMode");
  if (!STICKER_ACCESS_MODES.has(accessMode as StickerCatalogAccessMode)) {
    throw new StickerCatalogValidationError("Sticker catalog accessMode is invalid");
  }
  if (!Array.isArray(value.stickers)) {
    throw new StickerCatalogValidationError("Sticker catalog stickers must be an array");
  }
  const stickers = value.stickers.map(parseEntry);
  if (new Set(stickers.map((sticker) => sticker.id)).size !== stickers.length) {
    throw new StickerCatalogValidationError("Sticker catalog contains duplicate Workspace IDs");
  }
  return {
    schemaVersion: 1,
    catalogVersion,
    accessMode: accessMode as StickerCatalogAccessMode,
    stickers,
  };
}

export const BUNDLED_STICKER_CATALOG = parseStickerCatalog(rawStickerCatalog);

export function searchStickerCatalog(
  catalog: StickerCatalog,
  query: string,
): StickerCatalogEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const availableStickers = catalog.stickers.filter(
    (sticker) => sticker.active && !sticker.blocked,
  );
  if (normalizedQuery.length === 0) return [...availableStickers];
  return availableStickers.filter((sticker) => {
    const searchableValues = [sticker.title, sticker.alt, ...sticker.tags, ...sticker.emoji];
    return searchableValues.some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}
