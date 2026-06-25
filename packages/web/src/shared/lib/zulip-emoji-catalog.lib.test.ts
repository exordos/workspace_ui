import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureZulipEmojiCatalog,
  ensureZulipEmojiCatalogLoaded,
  getZulipEmojiCatalogStatus,
  resetZulipEmojiCatalogForTests,
  resolveZulipUnicodeEmojiFromCatalog,
} from "./zulip-emoji-catalog.lib";

const fetchMock = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("zulip emoji catalog", () => {
  beforeEach(() => {
    resetZulipEmojiCatalogForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads server code_to_names and resolves canonical Zulip name and code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code_to_names: {
          "1f603": ["smiley", "happy"],
        },
      }),
    );

    configureZulipEmojiCatalog(
      "https://zulip.example.com/static/generated/emoji/emoji.json",
      "https://zulip.example.com",
    );
    await ensureZulipEmojiCatalogLoaded();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://zulip.example.com/static/generated/emoji/emoji.json",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "omit",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(resolveZulipUnicodeEmojiFromCatalog(["1f603"])).toEqual({
      emojiName: "smiley",
      emojiCode: "1f603",
      reactionType: "unicode_emoji",
    });
    expect(getZulipEmojiCatalogStatus()).toBe("ready");
  });

  it("resolves picker FE0F code to server canonical code without FE0F", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code_to_names: {
          "270d": ["writing_hand"],
        },
      }),
    );

    configureZulipEmojiCatalog("/static/generated/emoji/emoji.json", "https://zulip.example.com");
    await ensureZulipEmojiCatalogLoaded();

    expect(resolveZulipUnicodeEmojiFromCatalog(["270d-fe0f"])).toEqual({
      emojiName: "writing_hand",
      emojiCode: "270d",
      reactionType: "unicode_emoji",
    });
  });

  it("marks catalog failed when server data cannot be loaded", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    configureZulipEmojiCatalog("/static/generated/emoji/emoji.json", "https://zulip.example.com");
    await ensureZulipEmojiCatalogLoaded();

    expect(getZulipEmojiCatalogStatus()).toBe("failed");
    expect(resolveZulipUnicodeEmojiFromCatalog(["1f44d"])).toBeNull();
  });

  it("keeps the latest catalog when an older request resolves after reconfiguration", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    configureZulipEmojiCatalog("/static/generated/emoji/a.json", "https://a.example.com");
    const firstLoad = ensureZulipEmojiCatalogLoaded();

    configureZulipEmojiCatalog("/static/generated/emoji/b.json", "https://b.example.com");
    const secondLoad = ensureZulipEmojiCatalogLoaded();

    second.resolve(
      jsonResponse({
        code_to_names: {
          "1f44d": ["thumbs_up_b"],
        },
      }),
    );
    await secondLoad;

    expect(resolveZulipUnicodeEmojiFromCatalog(["1f44d"])).toEqual({
      emojiName: "thumbs_up_b",
      emojiCode: "1f44d",
      reactionType: "unicode_emoji",
    });

    first.resolve(
      jsonResponse({
        code_to_names: {
          "1f44d": ["thumbs_up_a"],
        },
      }),
    );
    await firstLoad;

    expect(resolveZulipUnicodeEmojiFromCatalog(["1f44d"])).toEqual({
      emojiName: "thumbs_up_b",
      emojiCode: "1f44d",
      reactionType: "unicode_emoji",
    });
    expect(getZulipEmojiCatalogStatus()).toBe("ready");
  });

  it("aborts the previous request without marking the latest catalog failed", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const captured: { firstSignal?: AbortSignal } = {};
    fetchMock
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        if (init?.signal instanceof AbortSignal) {
          captured.firstSignal = init.signal;
        }
        return first.promise;
      })
      .mockReturnValueOnce(second.promise);

    configureZulipEmojiCatalog("/static/generated/emoji/a.json", "https://a.example.com");
    const firstLoad = ensureZulipEmojiCatalogLoaded();

    configureZulipEmojiCatalog("/static/generated/emoji/b.json", "https://b.example.com");
    expect(captured.firstSignal?.aborted).toBe(true);
    const secondLoad = ensureZulipEmojiCatalogLoaded();

    second.resolve(
      jsonResponse({
        code_to_names: {
          "1f604": ["smile"],
        },
      }),
    );
    await secondLoad;

    first.reject(new DOMException("Aborted", "AbortError"));
    await firstLoad;

    expect(getZulipEmojiCatalogStatus()).toBe("ready");
    expect(resolveZulipUnicodeEmojiFromCatalog(["1f604"])).toEqual({
      emojiName: "smile",
      emojiCode: "1f604",
      reactionType: "unicode_emoji",
    });
  });
});
