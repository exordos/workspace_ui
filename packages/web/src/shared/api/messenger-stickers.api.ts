import { isWorkspaceUuid } from "~/shared/lib/workspace-reference-urn.lib";
import {
  messengerRequestJsonResult,
  messengerPostJson,
  messengerPutJson,
  messengerRequestFormDataResult,
  messengerRequestBinaryResult,
  parseDto,
  parseStrictDtoList,
  parsePaginationHeaders,
} from "./messenger-transport.internal";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
} from "./messenger-transport.internal";

export type StickerCategory = "gif" | "sticker";
export type StickerMediaFormat = "gif" | "webp" | "png";
export interface WorkspaceStickerDto {
  id: string;
  title: string;
  alt_text: string;
  emoji: string[];
  tags: string[];
  category: StickerCategory;
  media: { format: StickerMediaFormat; url: string; width?: number; height?: number };
  is_favorite: boolean;
}
export interface StickerListQuery {
  q?: string;
  favorite?: boolean;
  uuid?: readonly string[];
  category?: StickerCategory;
  format?: StickerMediaFormat;
  pageLimit?: number;
  pageMarker?: string;
}
export interface StickerUpdateBody {
  title?: string;
  alt_text?: string;
  emoji?: string[];
  tags?: string[];
  category?: StickerCategory;
  active?: boolean;
  blocked?: boolean;
}
export interface StickerImportResult {
  created: number;
  duplicates: number;
  items: {
    client_id: string;
    file: string;
    status: "created" | "duplicate";
    sticker_uuid: string;
  }[];
}
const record = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s: unknown) => typeof s === "string");
const dimension = (v: unknown) =>
  v === undefined || (typeof v === "number" && Number.isInteger(v) && v > 0);
export function isWorkspaceStickerDto(v: unknown): v is WorkspaceStickerDto {
  if (!record(v) || !record(v.media)) return false;
  return (
    isWorkspaceUuid(v.id) &&
    typeof v.title === "string" &&
    typeof v.alt_text === "string" &&
    strings(v.emoji) &&
    strings(v.tags) &&
    (v.category === "gif" || v.category === "sticker") &&
    ["gif", "webp", "png"].includes(String(v.media.format)) &&
    typeof v.media.url === "string" &&
    dimension(v.media.width) &&
    dimension(v.media.height) &&
    typeof v.is_favorite === "boolean"
  );
}
function stickerPath(id: string): string {
  if (!isWorkspaceUuid(id)) throw new TypeError("Invalid sticker UUID");
  return `/stickers/${id.toLowerCase()}`;
}
export async function getStickersPage(
  options: MessengerClientOptions,
  query: StickerListQuery = {},
): Promise<MessengerCollectionPage<WorkspaceStickerDto>> {
  if (Array.from(query.q?.trim() ?? "").length > 200)
    throw new TypeError("Sticker query exceeds 200 code points");
  if (query.uuid && (query.uuid.length > 100 || !query.uuid.every(isWorkspaceUuid)))
    throw new TypeError("Invalid sticker UUID batch");
  if (
    query.pageLimit !== undefined &&
    (!Number.isInteger(query.pageLimit) || query.pageLimit < 1 || query.pageLimit > 100)
  )
    throw new TypeError("Invalid sticker page limit");
  // No conditional requests: personalized pages must revalidate visibility on every load.
  const { data, headers } = await messengerRequestJsonResult("GET", "/stickers/", options, {
    q: query.q?.trim() === "" ? undefined : query.q?.trim(),
    favorite: query.favorite === undefined ? undefined : String(query.favorite),
    uuid: query.uuid,
    category: query.category,
    format: query.format,
    page_limit: query.pageLimit ?? 50,
    page_marker: query.pageMarker,
  });
  return {
    items: parseStrictDtoList(data, isWorkspaceStickerDto, "sticker list"),
    ...parsePaginationHeaders(headers),
  };
}
export async function getSticker(
  options: MessengerClientOptions,
  id: string,
): Promise<WorkspaceStickerDto> {
  const { data } = await messengerRequestJsonResult("GET", stickerPath(id), options);
  return parseDto(data, isWorkspaceStickerDto, "sticker card");
}
export async function setStickerFavorite(
  options: MessengerClientOptions,
  id: string,
  favorite: boolean,
): Promise<void> {
  await messengerPostJson(
    `${stickerPath(id)}/actions/${favorite ? "star" : "unstar"}/invoke`,
    options,
    {},
  );
}
export async function updateSticker(
  options: MessengerClientOptions,
  id: string,
  body: StickerUpdateBody,
): Promise<WorkspaceStickerDto> {
  if (!isValidStickerUpdate(body)) throw new TypeError("Invalid sticker metadata");
  return parseDto(
    await messengerPutJson(stickerPath(id), options, body),
    isWorkspaceStickerDto,
    "updated sticker",
  );
}

export function isValidStickerUpdate(body: StickerUpdateBody): boolean {
  const fields = Object.keys(body);
  if (
    fields.length === 0 ||
    fields.some(
      (key) =>
        !["title", "alt_text", "emoji", "tags", "category", "active", "blocked"].includes(key),
    )
  )
    return false;
  if (
    body.title !== undefined &&
    (body.title.trim().length === 0 || Array.from(body.title).length > 200)
  )
    return false;
  if (body.alt_text !== undefined && Array.from(body.alt_text).length > 500) return false;
  if (
    body.emoji &&
    (body.emoji.length > 5 ||
      body.emoji.some((value) => value.length === 0 || Array.from(value).length > 128))
  )
    return false;
  if (body.tags && !validStickerTags(body.tags)) return false;
  if (body.active === true && body.blocked === true) return false;
  return true;
}
function validStickerTags(tags: string[]): boolean {
  return (
    tags.length <= 64 &&
    tags.every((value) => value.length > 0 && Array.from(value).length <= 64) &&
    tags.reduce((bytes, tag) => bytes + new TextEncoder().encode(tag).length, 0) <= 4096
  );
}
function isImportResult(v: unknown): v is StickerImportResult {
  return (
    record(v) &&
    Number.isInteger(v.created) &&
    Number(v.created) >= 0 &&
    Number.isInteger(v.duplicates) &&
    Number(v.duplicates) >= 0 &&
    Array.isArray(v.items) &&
    v.items.every(
      (item: unknown) =>
        record(item) &&
        isWorkspaceUuid(item.client_id) &&
        isWorkspaceUuid(item.sticker_uuid) &&
        typeof item.file === "string" &&
        (item.status === "created" || item.status === "duplicate"),
    )
  );
}
export async function importStickerArchive(
  options: MessengerClientOptions,
  archive: File,
): Promise<StickerImportResult> {
  if (archive.size > 40 * 1024 * 1024) throw new TypeError("Sticker archive exceeds 40 MiB");
  const form = new FormData();
  form.append("archive", archive);
  const { data } = await messengerRequestFormDataResult(
    "/stickers/actions/import_archive/invoke",
    options,
    form,
  );
  return parseDto(data, isImportResult, "sticker import");
}
export async function downloadSticker(
  options: MessengerClientOptions,
  card: Pick<WorkspaceStickerDto, "id" | "media">,
): Promise<Blob> {
  const path = `${stickerPath(card.id)}/actions/download`;
  // Only the contracted backend route can receive the bearer token, never arbitrary media origins.
  if (card.media.url !== `/api/workspace/v1/messenger${path}`)
    throw new TypeError("Unexpected sticker media URL");
  const { blob } = await messengerRequestBinaryResult(path, options, {}, "no-cache");
  return blob.type === `image/${card.media.format}`
    ? blob
    : new Blob([blob], { type: `image/${card.media.format}` });
}
