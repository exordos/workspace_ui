import { afterEach, describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import {
  applyPendingLinkPreviewsToMessage,
  clearPendingLinkPreviewsForTests,
  enqueuePendingLinkPreview,
} from "./message-link-preview-pending.lib";

function baseMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: "00000000-0000-4000-8000-000000000009",
    sender_id: 1,
    sender_full_name: "Alice",
    stream_uuid: "00000000-0000-4000-8000-000000000010",
    subject: "general",
    content: "https://example.com",
    timestamp: 1,
    ...overrides,
  };
}

describe("pending link previews", () => {
  afterEach(() => {
    clearPendingLinkPreviewsForTests();
  });

  it("applies buffered preview when message row appears", () => {
    enqueuePendingLinkPreview("00000000-0000-4000-8000-000000000009", {
      targetUrl: "https://example.com/",
      title: "Example",
    });
    const result = applyPendingLinkPreviewsToMessage(baseMessage());
    expect(result.link_previews?.[0]?.title).toBe("Example");
  });

  it("drops pending preview when URL is not in markdown", () => {
    enqueuePendingLinkPreview("00000000-0000-4000-8000-000000000009", {
      targetUrl: "https://other.test",
      title: "Other",
    });
    const result = applyPendingLinkPreviewsToMessage(baseMessage());
    expect(result.link_previews).toBeUndefined();
  });
});
