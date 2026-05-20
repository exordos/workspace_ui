import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  linkPreviewsFromMessage,
  upsertLinkPreviewOnMessage,
} from "./message-link-preview-list.lib";

function baseMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 1,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "",
    timestamp: 1,
    ...overrides,
  };
}

describe("linkPreviewsFromMessage", () => {
  it("merges link_previews and legacy link_preview without duplicates", () => {
    const list = linkPreviewsFromMessage({
      link_preview: { targetUrl: "https://a.test", title: "A" },
      link_previews: [
        { targetUrl: "https://b.test", title: "B" },
        { targetUrl: "https://a.test", title: "A dup" },
      ],
    });
    expect(list.map((p) => p.targetUrl)).toEqual(["https://a.test", "https://b.test"]);
    expect(list.find((p) => p.targetUrl === "https://a.test")?.title).toBe("A");
  });
});

describe("upsertLinkPreviewOnMessage", () => {
  it("adds and updates previews by target URL", () => {
    const first = upsertLinkPreviewOnMessage(baseMessage(), {
      targetUrl: "https://one.test",
      title: "One",
    });
    const second = upsertLinkPreviewOnMessage(first, {
      targetUrl: "https://two.test",
      title: "Two",
    });
    const updated = upsertLinkPreviewOnMessage(second, {
      targetUrl: "https://one.test",
      title: "One updated",
    });

    expect(updated.link_previews?.map((p) => p.targetUrl).sort()).toEqual([
      "https://one.test",
      "https://two.test",
    ]);
    expect(updated.link_previews?.find((p) => p.targetUrl === "https://one.test")?.title).toBe(
      "One updated",
    );
    expect(updated.link_preview).toBeUndefined();
  });
});
