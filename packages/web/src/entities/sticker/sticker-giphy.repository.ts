import { searchStickerCatalog } from "./sticker-catalog.lib";
import type { StickerCatalogRepository, StickerCatalogSource } from "./sticker.repository";
import type {
  Sticker,
  StickerAttribution,
  StickerCatalogEntry,
  StickerFormat,
} from "./sticker.types";

const GIPHY_API_URL = "https://api.giphy.com/v1/gifs";
const GIPHY_SEARCH_API_URL = "https://api.giphy.com/v1/gifs/search";
const GIPHY_TRENDING_API_URL = "https://api.giphy.com/v1/gifs/trending";
const GIPHY_BATCH_LIMIT = 100;
const GIPHY_DISCOVERY_LIMIT = 24;

interface GiphyRepositoryOptions {
  apiKey: string;
  catalogSource: StickerCatalogSource;
  fetchImplementation?: typeof fetch;
}

interface GiphyRendition {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
  size?: string;
  webp_size?: string;
}

interface GiphyUser {
  username?: string;
  display_name?: string;
}

interface GiphyGif {
  id?: string;
  url?: string;
  username?: string;
  title?: string;
  alt_text?: string;
  user?: GiphyUser;
  images?: {
    fixed_width?: GiphyRendition;
    fixed_width_still?: GiphyRendition;
    original?: GiphyRendition;
    original_still?: GiphyRendition;
  };
}

interface GiphyMedia {
  externalId: string;
  title?: string;
  alt?: string;
  format: "gif" | "webp";
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  fileSize?: number;
  attribution: StickerAttribution;
}

interface PendingMediaRequest {
  promise: Promise<GiphyMedia | null>;
  resolve: (media: GiphyMedia | null) => void;
  reject: (reason: unknown) => void;
}

export class GiphyStickerCatalogNotConfiguredError extends Error {
  constructor() {
    super("VITE_GIPHY_API_KEY is required for GIPHY stickers");
    this.name = "GiphyStickerCatalogNotConfiguredError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseRendition(value: unknown): GiphyRendition | undefined {
  if (!isRecord(value)) return undefined;
  return {
    url: optionalString(value.url),
    webp: optionalString(value.webp),
    width: optionalString(value.width),
    height: optionalString(value.height),
    size: optionalString(value.size),
    webp_size: optionalString(value.webp_size),
  };
}

function parseUser(value: unknown): GiphyUser | undefined {
  if (!isRecord(value)) return undefined;
  return {
    username: optionalString(value.username),
    display_name: optionalString(value.display_name),
  };
}

function parseGif(value: unknown): GiphyGif | undefined {
  if (!isRecord(value)) return undefined;
  const images = isRecord(value.images)
    ? {
        fixed_width: parseRendition(value.images.fixed_width),
        fixed_width_still: parseRendition(value.images.fixed_width_still),
        original: parseRendition(value.images.original),
        original_still: parseRendition(value.images.original_still),
      }
    : undefined;
  return {
    id: optionalString(value.id),
    url: optionalString(value.url),
    username: optionalString(value.username),
    title: optionalString(value.title),
    alt_text: optionalString(value.alt_text),
    user: parseUser(value.user),
    images,
  };
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value == null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isTrustedGiphyUrl(value: string | undefined): value is string {
  if (value == null) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "giphy.com" || url.hostname.endsWith(".giphy.com"))
    );
  } catch {
    return false;
  }
}

function firstTrustedGiphyUrl(...values: (string | undefined)[]): string | undefined {
  return values.find(isTrustedGiphyUrl);
}

function creatorName(gif: GiphyGif): string | undefined {
  return gif.user?.display_name ?? gif.user?.username ?? gif.username;
}

function mapGiphyMedia(gif: GiphyGif): GiphyMedia | null {
  if (gif.id == null) return null;
  const candidates = [
    { rendition: gif.images?.fixed_width, still: gif.images?.fixed_width_still },
    { rendition: gif.images?.original, still: gif.images?.original_still },
  ];

  for (const { rendition, still } of candidates) {
    if (rendition == null) continue;

    const webpUrl = firstTrustedGiphyUrl(rendition.webp);
    const gifUrl = firstTrustedGiphyUrl(rendition.url);
    const url = webpUrl ?? gifUrl;
    const width = parsePositiveInteger(rendition.width);
    const height = parsePositiveInteger(rendition.height);
    if (url == null || width == null || height == null) continue;

    const format = webpUrl == null ? "gif" : "webp";
    const thumbnailUrl = firstTrustedGiphyUrl(still?.url, still?.webp);
    const fileSize = parsePositiveInteger(format === "webp" ? rendition.webp_size : rendition.size);

    return {
      externalId: gif.id,
      title: gif.title,
      alt: gif.alt_text,
      format,
      url,
      thumbnailUrl,
      width,
      height,
      fileSize,
      attribution: {
        provider: "GIPHY",
        creator: creatorName(gif),
        pageUrl: firstTrustedGiphyUrl(gif.url),
      },
    };
  }

  return null;
}

function parseGiphyMediaList(payload: unknown): GiphyMedia[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("GIPHY response has an invalid shape");
  }
  const meta = payload.meta;
  if (!isRecord(meta) || typeof meta.status !== "number") {
    throw new Error("GIPHY response metadata is invalid");
  }
  if (meta.status !== 200) {
    throw new Error(`GIPHY response failed with status ${meta.status}`);
  }
  if (optionalString(meta.response_id) == null) {
    throw new Error("GIPHY response is missing a response ID");
  }
  return payload.data.flatMap((item) => {
    const gif = parseGif(item);
    const media = gif == null ? null : mapGiphyMedia(gif);
    return media == null ? [] : [media];
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The operation was aborted", "AbortError");
  }
}

function waitForPromiseWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal == null) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The operation was aborted", "AbortError"),
      );
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(
          error instanceof Error ? error : new Error("GIPHY request failed", { cause: error }),
        );
      },
    );
  });
}

function chunks<T>(items: readonly T[], limit: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += limit) {
    result.push(items.slice(index, index + limit));
  }
  return result;
}

function toResolvedSticker(entry: StickerCatalogEntry, media: GiphyMedia): Sticker {
  const preferredFormat: StickerFormat = media.format;
  return {
    ...entry,
    reference: { kind: "workspace", stickerId: entry.id },
    title: media.title ?? entry.title,
    alt: media.alt ?? entry.alt,
    media: {
      animated: true,
      width: media.width,
      height: media.height,
      aspectRatio: media.width / media.height,
      preferredFormat,
    },
    attribution: {
      provider: media.attribution.provider,
      creator: media.attribution.creator ?? entry.attribution.creator,
      pageUrl: media.attribution.pageUrl ?? entry.attribution.pageUrl,
    },
    format: media.format,
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    fileSize: media.fileSize,
  };
}

function toProviderSticker(media: GiphyMedia): Sticker {
  const title = media.title ?? "GIPHY GIF";
  return {
    id: `giphy:${media.externalId}`,
    reference: { kind: "provider", provider: "giphy", externalId: media.externalId },
    source: { provider: "giphy", externalId: media.externalId },
    title,
    alt: media.alt ?? title,
    emoji: [],
    tags: [],
    media: {
      animated: true,
      width: media.width,
      height: media.height,
      aspectRatio: media.width / media.height,
      preferredFormat: media.format,
    },
    attribution: media.attribution,
    rating: "g",
    active: true,
    blocked: false,
    format: media.format,
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    fileSize: media.fileSize,
  };
}

export function createGiphyStickerCatalogRepository({
  apiKey,
  catalogSource,
  fetchImplementation = fetch,
}: GiphyRepositoryOptions): StickerCatalogRepository {
  const pendingMediaRequests = new Map<string, PendingMediaRequest>();
  const queuedExternalIds = new Set<string>();
  let batchFlushScheduled = false;

  function requireApiKey(): void {
    if (apiKey.trim().length === 0) {
      throw new GiphyStickerCatalogNotConfiguredError();
    }
  }

  async function fetchMediaBatch(batch: readonly string[]): Promise<void> {
    try {
      requireApiKey();
      const requestedIds = new Set(batch);
      const requestUrl = new URL(GIPHY_API_URL);
      requestUrl.searchParams.set("api_key", apiKey);
      requestUrl.searchParams.set("ids", batch.join(","));
      requestUrl.searchParams.set("rating", "g");

      const response = await fetchImplementation(requestUrl);
      if (!response.ok) {
        throw new Error(`GIPHY request failed with status ${response.status}`);
      }
      const payload: unknown = await response.json();
      const mediaByExternalId = new Map(
        parseGiphyMediaList(payload)
          .filter((media) => requestedIds.has(media.externalId))
          .map((media) => [media.externalId, media] as const),
      );
      for (const externalId of batch) {
        pendingMediaRequests.get(externalId)?.resolve(mediaByExternalId.get(externalId) ?? null);
      }
    } catch (error) {
      for (const externalId of batch) {
        pendingMediaRequests.get(externalId)?.reject(error);
      }
    }
  }

  function flushMediaBatch(): void {
    batchFlushScheduled = false;
    const externalIds = [...queuedExternalIds];
    queuedExternalIds.clear();
    for (const batch of chunks(externalIds, GIPHY_BATCH_LIMIT)) {
      void fetchMediaBatch(batch);
    }
  }

  function requestMedia(externalId: string): Promise<GiphyMedia | null> {
    const inFlight = pendingMediaRequests.get(externalId);
    if (inFlight != null) return inFlight.promise;

    let resolveRequest: (media: GiphyMedia | null) => void = () => undefined;
    let rejectRequest: (reason: unknown) => void = () => undefined;
    const rawPromise = new Promise<GiphyMedia | null>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const request: PendingMediaRequest = {
      promise: rawPromise.finally(() => {
        if (pendingMediaRequests.get(externalId) === request) {
          pendingMediaRequests.delete(externalId);
        }
      }),
      resolve: resolveRequest,
      reject: rejectRequest,
    };
    pendingMediaRequests.set(externalId, request);
    queuedExternalIds.add(externalId);
    if (!batchFlushScheduled) {
      batchFlushScheduled = true;
      queueMicrotask(flushMediaBatch);
    }
    return request.promise;
  }

  async function fetchMedia(
    externalIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, GiphyMedia>> {
    throwIfAborted(signal);
    const uniqueIds = [...new Set(externalIds)];
    if (uniqueIds.length === 0) return new Map();
    requireApiKey();

    const resolvedMedia = await Promise.all(
      uniqueIds.map(async (externalId) => {
        const media = await waitForPromiseWithSignal(requestMedia(externalId), signal);
        return [externalId, media] as const;
      }),
    );
    throwIfAborted(signal);
    return new Map(
      resolvedMedia.flatMap(([externalId, media]) =>
        media == null ? [] : [[externalId, media] as const],
      ),
    );
  }

  async function resolveEntries(
    entries: readonly StickerCatalogEntry[],
    signal?: AbortSignal,
  ): Promise<Sticker[]> {
    if (entries.length === 0) return [];
    const mediaByExternalId = await fetchMedia(
      entries.map((entry) => entry.source.externalId),
      signal,
    );
    return entries.flatMap((entry) => {
      const media = mediaByExternalId.get(entry.source.externalId);
      return media == null ? [] : [toResolvedSticker(entry, media)];
    });
  }

  async function discoverMedia(requestUrl: URL, signal?: AbortSignal): Promise<readonly Sticker[]> {
    throwIfAborted(signal);
    requireApiKey();
    requestUrl.searchParams.set("api_key", apiKey);
    requestUrl.searchParams.set("limit", String(GIPHY_DISCOVERY_LIMIT));
    requestUrl.searchParams.set("rating", "g");
    requestUrl.searchParams.set("remove_low_contrast", "true");

    const response = await fetchImplementation(requestUrl, { signal });
    if (!response.ok) {
      throw new Error(`GIPHY request failed with status ${response.status}`);
    }
    const mediaList = parseGiphyMediaList(await response.json());
    throwIfAborted(signal);
    return mediaList.map(toProviderSticker);
  }

  return {
    async list(signal) {
      const catalog = await catalogSource.load(signal);
      if (catalog.accessMode === "unrestricted") {
        return discoverMedia(new URL(GIPHY_TRENDING_API_URL), signal);
      }
      const entries = catalog.stickers.filter((entry) => entry.active && !entry.blocked);
      return resolveEntries(entries, signal);
    },

    async search(query, signal) {
      const catalog = await catalogSource.load(signal);
      if (catalog.accessMode === "unrestricted") {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length === 0) {
          return discoverMedia(new URL(GIPHY_TRENDING_API_URL), signal);
        }
        const requestUrl = new URL(GIPHY_SEARCH_API_URL);
        requestUrl.searchParams.set("q", normalizedQuery.slice(0, 50));
        return discoverMedia(requestUrl, signal);
      }
      return resolveEntries(searchStickerCatalog(catalog, query), signal);
    },

    async resolve(reference, signal) {
      const catalog = await catalogSource.load(signal);
      if (reference.kind === "provider") {
        if (catalog.accessMode !== "unrestricted") return null;
        const mediaByExternalId = await fetchMedia([reference.externalId], signal);
        const media = mediaByExternalId.get(reference.externalId);
        return media == null ? null : toProviderSticker(media);
      }

      const entry = catalog.stickers.find((candidate) => candidate.id === reference.stickerId);
      if (entry == null || entry.blocked) return null;
      const resolved = await resolveEntries([entry], signal);
      return resolved[0] ?? null;
    },
  };
}
