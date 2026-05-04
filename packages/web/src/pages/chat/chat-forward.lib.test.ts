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

const permalinkOptions = {
  realmBaseUrl: "https://zulip.example.com",
  wroteLabel: "wrote",
  resolveStreamName: (streamId: number) => (streamId === 33 ? "InternalServicesDev" : "general"),
};

describe("buildForwardQuote", () => {
  it("formats a single forwarded message", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 1,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Hello",
            stream_id: null,
            subject: "",
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Alice" },
            ],
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      "@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/7,42-dm/near/1):\n```quote\nHello\n```",
    );
  });

  it("formats multiple forwarded messages in order", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 10,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "First",
            stream_id: null,
            subject: "",
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Alice" },
            ],
          },
          {
            id: 11,
            sender_full_name: "Bob",
            sender_id: 55,
            content: "Second",
            stream_id: 33,
            subject: "Workspace",
            display_recipient: "InternalServicesDev",
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      "@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/7,42-dm/near/10):\n```quote\nFirst\n```\n@_**Bob|55** [wrote](https://zulip.example.com/#narrow/channel/33-InternalServicesDev/topic/Workspace/near/11):\n```quote\nSecond\n```",
    );
  });

  it("uses selected text quote for single-message forward", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 1,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Original",
            stream_id: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        "Selected excerpt",
        permalinkOptions,
      ),
    ).toBe(
      "@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/42-dm/near/1):\n```quote\nSelected excerpt\n```",
    );
  });

  it("strips html tags from forwarded content payload", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 1,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "<p>Hello <strong>world</strong></p>",
            stream_id: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      "@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/42-dm/near/1):\n```quote\nHello world\n```",
    );
  });

  it("ignores selected text override for multi-forward payload", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 10,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "First",
            stream_id: null,
            subject: "",
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Alice" },
            ],
          },
          {
            id: 11,
            sender_full_name: "Bob",
            sender_id: 55,
            content: "Second",
            stream_id: 33,
            subject: "Workspace",
            display_recipient: "InternalServicesDev",
          },
        ],
        "Selected excerpt",
        permalinkOptions,
      ),
    ).toBe(
      "@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/7,42-dm/near/10):\n```quote\nFirst\n```\n@_**Bob|55** [wrote](https://zulip.example.com/#narrow/channel/33-InternalServicesDev/topic/Workspace/near/11):\n```quote\nSecond\n```",
    );
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

  it("uses explicit empty-topic token when topic is empty", () => {
    expect(
      resolveForwardTargetRoute("engineering", "   ", undefined, [
        { stream_id: 10, name: "engineering" },
      ]),
    ).toBe("/stream/10-engineering/topic/__empty__");
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
      draftTopic: "",
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
