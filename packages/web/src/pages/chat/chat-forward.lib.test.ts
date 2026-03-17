import { describe, expect, it } from "vitest";
import {
  buildForwardQuote,
  consumePendingForwardPrefill,
  mergeForwardDraftContent,
  resolveForwardDraftTarget,
  resolveForwardTargetRoute,
  setPendingForwardPrefill,
  toggleForwardRecipient,
} from "./chat-forward.lib";

describe("buildForwardQuote", () => {
  it("formats a single forwarded message", () => {
    expect(
      buildForwardQuote([
        {
          id: 1,
          sender_full_name: "Alice",
          content: "Hello",
        },
      ]),
    ).toBe("@_**Alice**\n```quote\nHello\n```");
  });

  it("formats multiple forwarded messages in order", () => {
    expect(
      buildForwardQuote([
        {
          id: 10,
          sender_full_name: "Alice",
          content: "First",
        },
        {
          id: 11,
          sender_full_name: "Bob",
          content: "Second",
        },
      ]),
    ).toBe("@_**Alice**\n```quote\nFirst\n```\n@_**Bob**\n```quote\nSecond\n```");
  });

  it("uses selected text quote for single-message forward", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 1,
            sender_full_name: "Alice",
            content: "Original",
          },
        ],
        "Selected excerpt",
      ),
    ).toBe("@_**Alice**\n```quote\nSelected excerpt\n```");
  });

  it("strips html tags from forwarded content payload", () => {
    expect(
      buildForwardQuote([
        {
          id: 1,
          sender_full_name: "Alice",
          content: "<p>Hello <strong>world</strong></p>",
        },
      ]),
    ).toBe("@_**Alice**\n```quote\nHello world\n```");
  });

  it("ignores selected text override for multi-forward payload", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 10,
            sender_full_name: "Alice",
            content: "First",
          },
          {
            id: 11,
            sender_full_name: "Bob",
            content: "Second",
          },
        ],
        "Selected excerpt",
      ),
    ).toBe("@_**Alice**\n```quote\nFirst\n```\n@_**Bob**\n```quote\nSecond\n```");
  });

  it("returns an empty string for empty input", () => {
    expect(buildForwardQuote([])).toBe("");
  });
});

describe("resolveForwardTargetRoute", () => {
  it("returns dm route for dm target", () => {
    expect(resolveForwardTargetRoute("", "", [42, 7], [])).toBe("/dm/7,42");
  });

  it("returns stream topic route for stream target", () => {
    expect(
      resolveForwardTargetRoute("engineering", "bugs", undefined, [
        { stream_id: 10, name: "engineering" },
      ]),
    ).toBe("/stream/10-engineering/topic/bugs");
  });

  it("uses general topic fallback when topic is empty", () => {
    expect(
      resolveForwardTargetRoute("engineering", "   ", undefined, [
        { stream_id: 10, name: "engineering" },
      ]),
    ).toBe("/stream/10-engineering/topic/general");
  });

  it("returns null when stream cannot be resolved", () => {
    expect(resolveForwardTargetRoute("missing", "general", undefined, [])).toBeNull();
  });
});

describe("toggleForwardRecipient", () => {
  it("adds a recipient when it is not selected", () => {
    expect(toggleForwardRecipient([], 42)).toEqual([42]);
  });

  it("removes a recipient when it is already selected", () => {
    expect(toggleForwardRecipient([7, 42], 42)).toEqual([7]);
  });

  it("keeps recipient list sorted for stable dm slug generation", () => {
    expect(toggleForwardRecipient([42], 7)).toEqual([7, 42]);
  });
});

describe("resolveForwardDraftTarget", () => {
  it("builds private draft target for dm forwarding", () => {
    expect(resolveForwardDraftTarget("", "", [42, 7], [])).toEqual({
      route: "/dm/7,42",
      draftType: "private",
      draftTo: [7, 42],
      draftTopic: "general",
    });
  });

  it("builds stream draft target for stream forwarding", () => {
    expect(
      resolveForwardDraftTarget("engineering", "bugs", undefined, [
        { stream_id: 10, name: "engineering" },
      ]),
    ).toEqual({
      route: "/stream/10-engineering/topic/bugs",
      draftType: "stream",
      draftTo: [10],
      draftTopic: "bugs",
    });
  });

  it("returns null when stream target cannot be resolved", () => {
    expect(resolveForwardDraftTarget("missing", "general", undefined, [])).toBeNull();
  });
});

describe("mergeForwardDraftContent", () => {
  it("returns only forwarded content when target draft is empty", () => {
    expect(mergeForwardDraftContent("@_**Alice**\n```quote\nHi\n```", undefined)).toBe(
      "@_**Alice**\n```quote\nHi\n```",
    );
  });

  it("prepends forwarded quote to existing draft content", () => {
    expect(mergeForwardDraftContent("@_**Alice**\n```quote\nHi\n```", "Existing text")).toBe(
      "@_**Alice**\n```quote\nHi\n```\nExisting text",
    );
  });
});

describe("pending forward prefill bridge", () => {
  it("stores and consumes pending prefill by route once", () => {
    setPendingForwardPrefill("/stream/7-test1/topic/general", "forward payload");

    expect(consumePendingForwardPrefill("/stream/7-test1/topic/general")).toBe("forward payload");
    expect(consumePendingForwardPrefill("/stream/7-test1/topic/general")).toBeUndefined();
  });
});
