import { describe, expect, it, vi } from "vitest";
import { createWorkspaceStickerResolver } from "~/entities/sticker/sticker-workspace.repository";
import {
  requestUrl,
  OTHER_STICKER_ID,
  STICKER_ID,
  stickerDto,
  stickerPageResponse,
} from "~/test/sticker-contract.fixture";
import {
  downloadSticker,
  getStickersPage,
  importStickerArchive,
  isWorkspaceStickerDto,
  isValidStickerUpdate,
  setStickerFavorite,
  updateSticker,
} from "./messenger-stickers.api";

const options = { accessToken: "fixture-token", projectId: "must-not-be-sent" };
describe("Workspace sticker HTTP contract", () => {
  it("reads an array and opaque pagination headers, serializing repeated UUIDs without project or user parameters", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(stickerPageResponse([stickerDto()], "opaque+/="));
    const page = await getStickersPage(
      { ...options, fetchImpl },
      {
        uuid: [STICKER_ID, OTHER_STICKER_ID],
        q: "ура",
        favorite: true,
        category: "sticker",
        format: "gif",
        pageLimit: 25,
        pageMarker: "before+/=",
      },
    );
    const url = new URL(requestUrl(fetchImpl.mock.calls[0]?.[0]), "https://example.com");
    expect(url.pathname).toBe("/api/workspace/v1/messenger/stickers/");
    expect(url.searchParams.getAll("uuid")).toEqual([STICKER_ID, OTHER_STICKER_ID]);
    expect(url.searchParams.get("page_marker")).toBe("before+/=");
    expect(url.searchParams.has("project_id")).toBe(false);
    expect(url.searchParams.has("user_uuid")).toBe(false);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fixture-token",
    );
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).has("If-None-Match")).toBe(false);
    expect(page).toMatchObject({
      items: [stickerDto()],
      nextPageMarker: "opaque+/=",
      pageLimit: 50,
    });
  });
  it("accepts absent dimensions and keeps category separate from format", () => {
    expect(isWorkspaceStickerDto(stickerDto())).toBe(true);
    expect(isWorkspaceStickerDto({ ...stickerDto(), id: undefined, uuid: STICKER_ID })).toBe(false);
    expect(
      isWorkspaceStickerDto({ ...stickerDto(), media: { ...stickerDto().media, width: 0 } }),
    ).toBe(false);
  });
  it("validates code points and collection limits before fetching", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(stickerPageResponse([])));
    await getStickersPage({ ...options, fetchImpl }, { q: "😀".repeat(200) });
    await expect(
      getStickersPage({ ...options, fetchImpl }, { q: "😀".repeat(201) }),
    ).rejects.toThrow("200");
    await expect(getStickersPage({ ...options, fetchImpl }, { pageLimit: 101 })).rejects.toThrow();
    await expect(
      getStickersPage({ ...options, fetchImpl }, { uuid: Array<string>(101).fill(STICKER_ID) }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("handles favorite=%s and its empty 200 response", async (favorite) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await setStickerFavorite({ ...options, fetchImpl }, STICKER_ID, favorite);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(`/actions/${favorite ? "star" : "unstar"}/invoke`),
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });
  it("sends one multipart archive with browser-owned content type and reads duplicate results", async () => {
    const result = {
      created: 0,
      duplicates: 1,
      items: [
        {
          client_id: STICKER_ID,
          file: `media/${STICKER_ID}.gif`,
          status: "duplicate",
          sticker_uuid: OTHER_STICKER_ID,
        },
      ],
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    expect(
      await importStickerArchive({ ...options, fetchImpl }, new File(["zip"], "stickers.zip")),
    ).toEqual(result);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(FormData);
    expect([...(init?.body as FormData).keys()]).toEqual(["archive"]);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
  it("rejects oversized archives without a request", async () => {
    const archive = new File([], "big.zip");
    Object.defineProperty(archive, "size", { value: 40 * 1024 * 1024 + 1 });
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(importStickerArchive({ ...options, fetchImpl }, archive)).rejects.toThrow(
      "40 MiB",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("enforces sticker metadata limits", () => {
    expect(isValidStickerUpdate({})).toBe(false);
    expect(isValidStickerUpdate({ title: "a".repeat(201) })).toBe(false);
    expect(isValidStickerUpdate({ alt_text: "a".repeat(501) })).toBe(false);
    expect(isValidStickerUpdate({ emoji: Array<string>(6).fill("😀") })).toBe(false);
    expect(isValidStickerUpdate({ tags: Array<string>(65).fill("tag") })).toBe(false);
    expect(isValidStickerUpdate({ tags: Array<string>(64).fill("😀".repeat(64)) })).toBe(false);
  });
  it("updates explicit catalog metadata without internal fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(stickerDto()));
    await updateSticker({ ...options, fetchImpl }, STICKER_ID, {
      title: "New",
      tags: ["celebration"],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(`/stickers/${STICKER_ID}`),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ title: "New", tags: ["celebration"] }),
      }),
    );
  });
  it("downloads authorized bytes without duplicating the API prefix and revalidates media", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("GIF89a"));
    const blob = await downloadSticker({ ...options, fetchImpl }, stickerDto());
    expect(blob.type).toBe("image/gif");
    expect(fetchImpl).toHaveBeenCalledWith(
      stickerDto().media.url,
      expect.objectContaining({ cache: "no-cache", method: "GET" }),
    );
    await expect(
      downloadSticker(
        { ...options, fetchImpl },
        { ...stickerDto(), media: { ...stickerDto().media, url: "https://evil.example/media" } },
      ),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([400, 403, 404, 500])("propagates HTTP %s", async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ error: "failure" }, { status })));
    await expect(getStickersPage({ ...options, fetchImpl })).rejects.toMatchObject({ status });
  });
});
describe("history batch integration", () => {
  it("coalesces UUIDs, follows pagination and leaves missing UUIDs unavailable", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stickerPageResponse([stickerDto()], "next"))
      .mockResolvedValueOnce(stickerPageResponse([]));
    const resolve = createWorkspaceStickerResolver(
      () => ({ ...options, fetchImpl }),
      () => "owner",
    );
    const values = await Promise.all([
      resolve(STICKER_ID),
      resolve(OTHER_STICKER_ID),
      resolve(STICKER_ID),
    ]);
    expect(values[0]?.id).toBe(STICKER_ID);
    expect(values[1]).toBeNull();
    expect(values[2]).toEqual(values[0]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      new URL(requestUrl(fetchImpl.mock.calls[1]?.[0]), "https://example.com").searchParams.get(
        "page_marker",
      ),
    ).toBe("next");
  });
  it("chunks more than 100 history UUIDs", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(stickerPageResponse([])));
    const resolve = createWorkspaceStickerResolver(
      () => ({ ...options, fetchImpl }),
      () => "owner",
    );
    await Promise.all(
      Array.from({ length: 101 }, (_, i) =>
        resolve(`11111111-1111-4111-8111-${String(i).padStart(12, "0")}`),
      ),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("rejects a looping cursor", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(stickerPageResponse([], "same")));
    const resolve = createWorkspaceStickerResolver(
      () => ({ ...options, fetchImpl }),
      () => "owner",
    );
    await expect(resolve(STICKER_ID)).rejects.toThrow("Repeated");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("rejects results after an account switch", async () => {
    let key = "a";
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      key = "b";
      return Promise.resolve(stickerPageResponse([stickerDto()]));
    });
    const resolve = createWorkspaceStickerResolver(
      () => ({ ...options, fetchImpl }),
      () => key,
    );
    await expect(resolve(STICKER_ID)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("deduplicates in-flight resolution and lets one consumer cancel independently", async () => {
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const resolve = createWorkspaceStickerResolver(
      () => ({ ...options, fetchImpl }),
      () => "owner",
    );
    const controller = new AbortController();
    const first = resolve(STICKER_ID, controller.signal);
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    const second = resolve(STICKER_ID);
    controller.abort();
    await cancelled;
    await Promise.resolve();
    finish(stickerPageResponse([stickerDto()]));
    const resolved = await second;
    expect(resolved?.id).toBe(STICKER_ID);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
