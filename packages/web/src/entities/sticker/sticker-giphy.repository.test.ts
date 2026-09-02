import { describe, expect, it, vi } from "vitest";
import {
  createGiphyStickerCatalogRepository,
  GiphyStickerCatalogNotConfiguredError,
} from "./sticker-giphy.repository";
import type { StickerCatalogSource } from "./sticker.repository";
import type { StickerCatalog, StickerCatalogEntry } from "./sticker.types";

function catalogEntry(
  id: string,
  externalId: string,
  overrides: Partial<StickerCatalogEntry> = {},
): StickerCatalogEntry {
  return {
    id,
    source: { provider: "giphy", externalId },
    title: `Local ${externalId}`,
    alt: `Local alt ${externalId}`,
    emoji: ["🎉"],
    tags: ["party"],
    media: {
      animated: true,
      width: 160,
      height: 120,
      aspectRatio: 4 / 3,
      preferredFormat: "webp",
    },
    attribution: { provider: "GIPHY" },
    rating: "g",
    active: true,
    blocked: false,
    ...overrides,
  };
}

function workspaceId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function source(
  stickers: readonly StickerCatalogEntry[],
  accessMode: StickerCatalog["accessMode"] = "allowlist",
): StickerCatalogSource {
  const catalog: StickerCatalog = {
    schemaVersion: 1,
    catalogVersion: "test",
    accessMode,
    stickers,
  };
  return { load: vi.fn().mockResolvedValue(catalog) };
}

function requireRequestUrl(input: RequestInfo | URL | undefined): URL {
  if (!(input instanceof URL)) throw new TypeError("Expected a URL request input");
  return input;
}

function giphyGif(externalId: string, urlHost = "media1.giphy.com"): Record<string, unknown> {
  return {
    id: externalId,
    url: `https://giphy.com/gifs/${externalId}`,
    username: "fallback-author",
    title: "Provider title",
    alt_text: "Provider alt",
    user: { display_name: "Creator" },
    images: {
      fixed_width: {
        url: `https://${urlHost}/media/${externalId}/200w.gif`,
        webp: `https://${urlHost}/media/${externalId}/200w.webp`,
        width: "200",
        height: "125",
        size: "25000",
        webp_size: "12000",
      },
      fixed_width_still: {
        url: `https://${urlHost}/media/${externalId}/200w_s.gif`,
        width: "200",
        height: "125",
      },
    },
  };
}

function giphyPayloadResponse(
  data: readonly unknown[],
  meta: Record<string, unknown> = { status: 200, msg: "OK", response_id: "response-id" },
): Response {
  return new Response(JSON.stringify({ data, meta }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function giphyResponse(externalId: string, urlHost = "media1.giphy.com"): Response {
  return giphyPayloadResponse([giphyGif(externalId, urlHost)]);
}

describe("createGiphyStickerCatalogRepository", () => {
  it("maps a catalog Workspace ID to normalized GIPHY media", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyResponse("provider-id"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "test",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    const result = await repository.resolve({ kind: "workspace", stickerId: entry.id });

    expect(result).toMatchObject({
      id: entry.id,
      reference: { kind: "workspace", stickerId: entry.id },
      source: { provider: "giphy", externalId: "provider-id" },
      title: "Provider title",
      alt: "Provider alt",
      format: "webp",
      url: "https://media1.giphy.com/media/provider-id/200w.webp",
      thumbnailUrl: "https://media1.giphy.com/media/provider-id/200w_s.gif",
      fileSize: 12000,
      media: {
        animated: true,
        width: 200,
        height: 125,
        aspectRatio: 1.6,
        preferredFormat: "webp",
      },
      attribution: {
        provider: "GIPHY",
        creator: "Creator",
        pageUrl: "https://giphy.com/gifs/provider-id",
      },
    });
    const requestUrl = requireRequestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://api.giphy.com/v1/gifs");
    expect(requestUrl.searchParams.get("api_key")).toBe("test");
    expect(requestUrl.searchParams.get("ids")).toBe("provider-id");
    expect(requestUrl.searchParams.get("rating")).toBe("g");
  });

  it("searches curated metadata locally before requesting matching IDs", async () => {
    const party = catalogEntry(workspaceId(1), "party-id", { tags: ["celebration"] });
    const sad = catalogEntry(workspaceId(2), "sad-id", { tags: ["sad"] });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyResponse("party-id"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([party, sad]),
      fetchImplementation: fetchMock,
    });

    const results = await repository.search("celebration");

    expect(results.map((sticker) => sticker.id)).toEqual([party.id]);
    const requestUrl = requireRequestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl.searchParams.get("ids")).toBe("party-id");
  });

  it("loads GIPHY trending when access mode is unrestricted", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyResponse("trending-id"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([], "unrestricted"),
      fetchImplementation: fetchMock,
    });

    const results = await repository.list();

    expect(results[0]).toMatchObject({
      id: "giphy:trending-id",
      reference: { kind: "provider", provider: "giphy", externalId: "trending-id" },
      source: { provider: "giphy", externalId: "trending-id" },
    });
    const requestUrl = requireRequestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://api.giphy.com/v1/gifs/trending");
    expect(requestUrl.searchParams.get("limit")).toBe("24");
    expect(requestUrl.searchParams.get("rating")).toBe("g");
  });

  it("uses remote GIPHY search when access mode is unrestricted", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyResponse("search-id"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([], "unrestricted"),
      fetchImplementation: fetchMock,
    });

    const results = await repository.search("happy dance");

    expect(results.map((sticker) => sticker.id)).toEqual(["giphy:search-id"]);
    const requestUrl = requireRequestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://api.giphy.com/v1/gifs/search");
    expect(requestUrl.searchParams.get("q")).toBe("happy dance");
    expect(requestUrl.searchParams.get("remove_low_contrast")).toBe("true");
  });

  it("resolves a provider reference without a Workspace catalog entry", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyResponse("provider-id"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([], "unrestricted"),
      fetchImplementation: fetchMock,
    });

    const result = await repository.resolve({
      kind: "provider",
      provider: "giphy",
      externalId: "provider-id",
    });

    expect(result?.reference).toEqual({
      kind: "provider",
      provider: "giphy",
      externalId: "provider-id",
    });
    const requestUrl = requireRequestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl.searchParams.get("ids")).toBe("provider-id");
  });

  it("does not resolve provider references in allowlist mode", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([], "allowlist"),
      fetchImplementation: fetchMock,
    });

    await expect(
      repository.resolve({
        kind: "provider",
        provider: "giphy",
        externalId: "provider-id",
      }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits Get GIFs by IDs requests to 100 IDs", async () => {
    const entries = Array.from({ length: 101 }, (_, index) =>
      catalogEntry(workspaceId(index + 1), `provider-${index + 1}`),
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(giphyPayloadResponse([])));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source(entries),
      fetchImplementation: fetchMock,
    });

    await repository.list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestSizes = fetchMock.mock.calls.map(([input]) => {
      const ids = requireRequestUrl(input).searchParams.get("ids");
      return ids?.split(",").length;
    });
    expect(requestSizes).toEqual([100, 1]);
  });

  it("coalesces concurrent same and different IDs into one batch request", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const otherEntry = catalogEntry(workspaceId(2), "other-provider-id");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const requestedIds = requireRequestUrl(input).searchParams.get("ids")?.split(",") ?? [];
      return Promise.resolve(giphyPayloadResponse(requestedIds.map((id) => giphyGif(id))));
    });
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry, otherEntry]),
      fetchImplementation: fetchMock,
    });

    const [first, duplicate, other] = await Promise.all([
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
      repository.resolve({ kind: "workspace", stickerId: otherEntry.id }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      requireRequestUrl(fetchMock.mock.calls[0]?.[0]).searchParams.get("ids")?.split(","),
    ).toEqual(["provider-id", "other-provider-id"]);
    expect(first?.id).toBe(entry.id);
    expect(duplicate?.id).toBe(entry.id);
    expect(other?.id).toBe(otherEntry.id);
  });

  it("does not retain settled media URLs", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(giphyResponse("provider-id")));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await repository.resolve({ kind: "workspace", stickerId: entry.id });
    await repository.resolve({ kind: "workspace", stickerId: entry.id });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects synthetic HTTP 200 responses without a response ID", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      giphyPayloadResponse([giphyGif("provider-id")], {
        status: 200,
        msg: "OK",
        response_id: "",
      }),
    );
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await expect(repository.resolve({ kind: "workspace", stickerId: entry.id })).rejects.toThrow(
      "response ID",
    );
  });

  it("rejects GIPHY meta errors returned with HTTP 200", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        giphyPayloadResponse([], { status: 429, msg: "Rate limit", response_id: "response-id" }),
      );
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await expect(repository.resolve({ kind: "workspace", stickerId: entry.id })).rejects.toThrow(
      "status 429",
    );
  });

  it("falls back to a valid original when fixed width is invalid", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const gif = giphyGif("provider-id");
    gif.images = {
      fixed_width: {
        url: "https://example.test/invalid.gif",
        width: "200",
        height: "125",
      },
      original: {
        url: "https://media1.giphy.com/media/provider-id/original.gif",
        width: "480",
        height: "270",
        size: "50000",
      },
      original_still: {
        url: "https://media1.giphy.com/media/provider-id/original_s.gif",
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(giphyPayloadResponse([gif]));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await expect(
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
    ).resolves.toMatchObject({
      format: "gif",
      url: "https://media1.giphy.com/media/provider-id/original.gif",
      thumbnailUrl: "https://media1.giphy.com/media/provider-id/original_s.gif",
      media: { width: 480, height: 270, aspectRatio: 480 / 270 },
    });
  });

  it("does not render blocked stickers", async () => {
    const entry = catalogEntry(workspaceId(1), "blocked-id", { blocked: true });
    const fetchMock = vi.fn<typeof fetch>();
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await expect(
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects untrusted media hosts", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(giphyResponse("provider-id", "giphy.com.example.test"));
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "key",
      catalogSource: source([entry]),
      fetchImplementation: fetchMock,
    });

    await expect(
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
    ).resolves.toBeNull();
  });

  it("requires a configured public browser key for non-empty GIPHY catalogs", async () => {
    const entry = catalogEntry(workspaceId(1), "provider-id");
    const repository = createGiphyStickerCatalogRepository({
      apiKey: "",
      catalogSource: source([entry]),
      fetchImplementation: vi.fn<typeof fetch>(),
    });

    await expect(
      repository.resolve({ kind: "workspace", stickerId: entry.id }),
    ).rejects.toBeInstanceOf(GiphyStickerCatalogNotConfiguredError);
  });
});
