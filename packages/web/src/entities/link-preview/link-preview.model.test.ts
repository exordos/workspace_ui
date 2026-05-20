import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLinkPreviewStore } from "./link-preview.model";

const fetchLinkPreviewsFromMessageMarkdownMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/message-link-preview-fetch.lib", () => ({
  fetchLinkPreviewsFromMessageMarkdown: (...args: unknown[]) =>
    fetchLinkPreviewsFromMessageMarkdownMock(...args),
}));

describe("useLinkPreviewStore", () => {
  beforeEach(() => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockReset();
    useLinkPreviewStore.getState().clear();
  });

  afterEach(() => {
    useLinkPreviewStore.getState().clear();
  });

  it("deduplicates in-flight requests for the same message", async () => {
    let resolveRender: (value: unknown) => void = () => {};
    fetchLinkPreviewsFromMessageMarkdownMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRender = resolve;
        }),
    );

    const markdown = "see https://example.com";
    const first = useLinkPreviewStore.getState().requestPreviewForMessage(1, markdown);
    const second = useLinkPreviewStore.getState().requestPreviewForMessage(1, markdown);

    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledTimes(1);

    resolveRender([
      {
        targetUrl: "https://example.com",
        data: { targetUrl: "https://example.com", title: "Example" },
      },
    ]);

    await Promise.all([first, second]);

    expect(useLinkPreviewStore.getState().byMessageId[1]?.status).toBe("ready");
    expect(useLinkPreviewStore.getState().byMessageId[1]?.items).toHaveLength(1);
  });

  it("returns cached ready entry without refetching when fingerprint matches", async () => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://cached.test",
        data: { targetUrl: "https://cached.test", title: "Cached" },
      },
    ]);

    const markdown = "https://cached.test";
    await useLinkPreviewStore.getState().requestPreviewForMessage(2, markdown);
    fetchLinkPreviewsFromMessageMarkdownMock.mockClear();

    const entry = await useLinkPreviewStore.getState().requestPreviewForMessage(2, markdown);
    expect(fetchLinkPreviewsFromMessageMarkdownMock).not.toHaveBeenCalled();
    expect(entry.status).toBe("ready");
    expect(entry.items[0]?.data?.title).toBe("Cached");
  });

  it("refetches when markdown fingerprint changes", async () => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://example.com",
        data: { targetUrl: "https://example.com", title: "Example" },
      },
    ]);

    await useLinkPreviewStore.getState().requestPreviewForMessage(3, "https://example.com");
    fetchLinkPreviewsFromMessageMarkdownMock.mockClear();
    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://other.test",
        data: { targetUrl: "https://other.test", title: "Other" },
      },
    ]);

    await useLinkPreviewStore.getState().requestPreviewForMessage(3, "https://other.test");
    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledWith(
      "https://other.test",
      3,
      expect.any(AbortSignal),
    );
  });

  it("clears stale loading on cancel so the next request can refetch", async () => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockImplementation(() => new Promise(() => {}));

    const markdown = "https://example.com";
    void useLinkPreviewStore.getState().requestPreviewForMessage(20, markdown);
    expect(useLinkPreviewStore.getState().byMessageId[20]?.status).toBe("loading");

    useLinkPreviewStore.getState().cancelPreviewForMessage(20);
    expect(useLinkPreviewStore.getState().byMessageId[20]).toBeUndefined();

    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://example.com",
        data: { targetUrl: "https://example.com", title: "Example" },
      },
    ]);

    await useLinkPreviewStore.getState().requestPreviewForMessage(20, markdown);
    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledTimes(2);
    expect(useLinkPreviewStore.getState().byMessageId[20]?.status).toBe("ready");
  });

  it("evicts oldest entries when cache exceeds max size", async () => {
    useLinkPreviewStore.getState().setMaxEntriesForTests(2);

    fetchLinkPreviewsFromMessageMarkdownMock.mockImplementation(() =>
      Promise.resolve([
        {
          targetUrl: "https://example.com",
          data: { targetUrl: "https://example.com", title: "Example" },
        },
      ]),
    );

    await useLinkPreviewStore.getState().requestPreviewForMessage(10, "https://a.test");
    await useLinkPreviewStore.getState().requestPreviewForMessage(11, "https://b.test");
    await useLinkPreviewStore.getState().requestPreviewForMessage(12, "https://c.test");

    const byMessageId = useLinkPreviewStore.getState().byMessageId;
    expect(byMessageId[10]).toBeUndefined();
    expect(byMessageId[11]?.status).toBe("ready");
    expect(byMessageId[12]?.status).toBe("ready");
  });
});
