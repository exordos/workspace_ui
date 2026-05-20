import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { mergeMessagePreservingLinkPreview } from "./message-link-preview-merge.lib";

function baseMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 1,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "https://example.com",
    timestamp: 1,
    ...overrides,
  };
}

describe("mergeMessagePreservingLinkPreview", () => {
  it("keeps link_preview from existing row when incoming omits it", () => {
    const existing = baseMessage({
      link_preview: { targetUrl: "https://example.com", title: "Example" },
    });
    const incoming = baseMessage({ id: 2, content: "https://example.com" });
    const merged = mergeMessagePreservingLinkPreview(incoming, existing);
    expect(merged.link_previews?.[0]?.title ?? merged.link_preview?.title).toBe("Example");
  });

  it("merges multiple link_previews by URL", () => {
    const existing = baseMessage({
      link_previews: [{ targetUrl: "https://a.test", title: "A" }],
    });
    const incoming = baseMessage({
      link_previews: [{ targetUrl: "https://b.test", title: "B" }],
    });
    const merged = mergeMessagePreservingLinkPreview(incoming, existing);
    expect(merged.link_previews?.map((p) => p.targetUrl).sort()).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });

  it("prefers incoming link_preview when present", () => {
    const existing = baseMessage({
      link_preview: { targetUrl: "https://old.test", title: "Old" },
    });
    const incoming = baseMessage({
      link_preview: { targetUrl: "https://new.test", title: "New" },
    });
    const merged = mergeMessagePreservingLinkPreview(incoming, existing);
    expect(merged.link_previews?.find((p) => p.targetUrl === "https://new.test")?.title).toBe(
      "New",
    );
  });
});
