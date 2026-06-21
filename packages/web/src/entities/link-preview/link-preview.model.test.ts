import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMessageId } from "~/test/factories";
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
    const messageId = testMessageId(1);
    const first = useLinkPreviewStore.getState().requestPreviewForMessage(messageId, markdown);
    const second = useLinkPreviewStore.getState().requestPreviewForMessage(messageId, markdown);

    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledTimes(1);

    resolveRender([
      {
        targetUrl: "https://example.com",
        data: { targetUrl: "https://example.com", title: "Example" },
      },
    ]);

    await Promise.all([first, second]);

    expect(useLinkPreviewStore.getState().byMessageId[messageId]?.status).toBe("ready");
    expect(useLinkPreviewStore.getState().byMessageId[messageId]?.items).toHaveLength(1);
  });

  it("returns cached ready entry without refetching when fingerprint matches", async () => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://cached.test",
        data: { targetUrl: "https://cached.test", title: "Cached" },
      },
    ]);

    const markdown = "https://cached.test";
    const messageId = testMessageId(2);
    await useLinkPreviewStore.getState().requestPreviewForMessage(messageId, markdown);
    fetchLinkPreviewsFromMessageMarkdownMock.mockClear();

    const entry = await useLinkPreviewStore
      .getState()
      .requestPreviewForMessage(messageId, markdown);
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

    const messageId = testMessageId(3);
    await useLinkPreviewStore.getState().requestPreviewForMessage(messageId, "https://example.com");
    fetchLinkPreviewsFromMessageMarkdownMock.mockClear();
    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://other.test",
        data: { targetUrl: "https://other.test", title: "Other" },
      },
    ]);

    await useLinkPreviewStore.getState().requestPreviewForMessage(messageId, "https://other.test");
    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledWith(
      "https://other.test",
      messageId,
      expect.any(AbortSignal),
    );
  });

  it("clears stale loading on cancel so the next request can refetch", async () => {
    fetchLinkPreviewsFromMessageMarkdownMock.mockImplementation(() => new Promise(() => {}));

    const markdown = "https://example.com";
    const messageId = testMessageId(20);
    void useLinkPreviewStore.getState().requestPreviewForMessage(messageId, markdown);
    expect(useLinkPreviewStore.getState().byMessageId[messageId]?.status).toBe("loading");

    useLinkPreviewStore.getState().cancelPreviewForMessage(messageId);
    expect(useLinkPreviewStore.getState().byMessageId[messageId]).toBeUndefined();

    fetchLinkPreviewsFromMessageMarkdownMock.mockResolvedValue([
      {
        targetUrl: "https://example.com",
        data: { targetUrl: "https://example.com", title: "Example" },
      },
    ]);

    await useLinkPreviewStore.getState().requestPreviewForMessage(messageId, markdown);
    expect(fetchLinkPreviewsFromMessageMarkdownMock).toHaveBeenCalledTimes(2);
    expect(useLinkPreviewStore.getState().byMessageId[messageId]?.status).toBe("ready");
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

    const firstId = testMessageId(10);
    const secondId = testMessageId(11);
    const thirdId = testMessageId(12);
    await useLinkPreviewStore.getState().requestPreviewForMessage(firstId, "https://a.test");
    await useLinkPreviewStore.getState().requestPreviewForMessage(secondId, "https://b.test");
    await useLinkPreviewStore.getState().requestPreviewForMessage(thirdId, "https://c.test");

    const byMessageId = useLinkPreviewStore.getState().byMessageId;
    expect(byMessageId[firstId]).toBeUndefined();
    expect(byMessageId[secondId]?.status).toBe("ready");
    expect(byMessageId[thirdId]?.status).toBe("ready");
  });
});
