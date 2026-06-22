import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
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
  realmBaseUrl: "https://chat.example.com",
  wroteLabel: "wrote",
  resolveStreamName: (streamUuid: string) =>
    streamUuid === "33333333-3333-4333-8333-333333333333" ? "InternalServicesDev" : "general",
};

describe("buildForwardQuote", () => {
  it("formats a single forwarded message", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Hello",
            stream_uuid: null,
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
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/7,42-dm/near/${testMessageId(1)}):\n\`\`\`quote\nHello\n\`\`\`\n\n`,
    );
  });

  it("formats multiple forwarded messages in order", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000010",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "First",
            stream_uuid: null,
            subject: "",
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Alice" },
            ],
          },
          {
            id: "00000000-0000-4000-8000-000000000011",
            sender_full_name: "Bob",
            sender_id: 55,
            content: "Second",
            stream_uuid: "33333333-3333-4333-8333-333333333333",
            subject: "Workspace",
            display_recipient: "InternalServicesDev",
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/7,42-dm/near/${testMessageId(10)}):\n\`\`\`quote\nFirst\n\`\`\`\n\n\n\n@_**Bob|55** [wrote](https://chat.example.com/#narrow/channel/33333333-3333-4333-8333-333333333333/topic/Workspace/near/${testMessageId(11)}):\n\`\`\`quote\nSecond\n\`\`\`\n\n`,
    );
  });

  it("uses selected text quote for single-message forward", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Original",
            stream_uuid: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        "Selected excerpt",
        permalinkOptions,
      ),
    ).toBe(
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/42-dm/near/${testMessageId(1)}):\n\`\`\`quote\nSelected excerpt\n\`\`\`\n\n`,
    );
  });

  it("uses longer quote fences when forwarded content already contains quote fences", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000020",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Original body",
            stream_uuid: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        "@_**Bob|55**:\n```quote\nnested\n```",
        permalinkOptions,
      ),
    ).toContain("````quote\n@_**Bob|55**:\n```quote\nnested\n```\n````\n\n");
  });

  it("strips html tags from forwarded content payload when markdown_source is missing", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "<p>Hello <strong>world</strong></p>",
            stream_uuid: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/42-dm/near/${testMessageId(1)}):\n\`\`\`quote\nHello world\n\`\`\`\n\n`,
    );
  });

  it("preserves nested reply quote inside forward payload from markdown_source", () => {
    const nestedMarkdown = `@_**corle|21** [wrote](https://chat.example.com/#narrow/dm/21-dm/near/1000):
\`\`\`quote
и тут тоже

дай ссылку на то как приложуху поставить
\`\`\``;

    const result = buildForwardQuote(
      [
        {
          id: "00000000-0000-4000-8000-000000002275",
          sender_full_name: "user",
          sender_id: 9,
          content: "<p>rendered html</p>",
          markdown_source: nestedMarkdown,
          stream_uuid: "33333333-3333-4333-8333-333333333333",
          subject: "general",
          display_recipient: "sandbox",
        },
      ],
      undefined,
      permalinkOptions,
    );

    expect(result).toContain("@_**corle|21**");
    expect(result).toContain("[wrote](https://chat.example.com/#narrow/dm/21-dm/near/1000)");
    expect(result).toContain("````quote\n@_**corle|21**");
    expect(result).toContain("```quote\nи тут тоже");
    expect(result).toContain("дай ссылку на то как приложуху поставить");
  });

  it("prefers markdown_source over rendered html for forward payload", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "<p><strong>Hi</strong></p>",
            markdown_source: "**Hi**",
            stream_uuid: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        undefined,
        permalinkOptions,
      ),
    ).toBe(
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/42-dm/near/${testMessageId(1)}):\n\`\`\`quote\n**Hi**\n\`\`\`\n\n`,
    );
  });

  it("ignores selected text override for multi-forward payload", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: "00000000-0000-4000-8000-000000000010",
            sender_full_name: "Alice",
            sender_id: 42,
            content: "First",
            stream_uuid: null,
            subject: "",
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Alice" },
            ],
          },
          {
            id: "00000000-0000-4000-8000-000000000011",
            sender_full_name: "Bob",
            sender_id: 55,
            content: "Second",
            stream_uuid: "33333333-3333-4333-8333-333333333333",
            subject: "Workspace",
            display_recipient: "InternalServicesDev",
          },
        ],
        "Selected excerpt",
        permalinkOptions,
      ),
    ).toBe(
      `@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/7,42-dm/near/${testMessageId(10)}):\n\`\`\`quote\nFirst\n\`\`\`\n\n\n\n@_**Bob|55** [wrote](https://chat.example.com/#narrow/channel/33333333-3333-4333-8333-333333333333/topic/Workspace/near/${testMessageId(11)}):\n\`\`\`quote\nSecond\n\`\`\`\n\n`,
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
        { stream_uuid: "22222222-2222-4222-8222-222222222222", name: "engineering" },
      ]),
    ).toBe("/stream/22222222-2222-4222-8222-222222222222/topic/bugs");
  });

  it("uses explicit empty-topic token when topic is empty", () => {
    expect(
      resolveForwardTargetRoute("engineering", "   ", undefined, [
        { stream_uuid: "22222222-2222-4222-8222-222222222222", name: "engineering" },
      ]),
    ).toBe("/stream/22222222-2222-4222-8222-222222222222/topic/__empty__");
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
        { stream_uuid: "22222222-2222-4222-8222-222222222222", name: "engineering" },
      ]),
    ).toEqual({
      route: "/stream/22222222-2222-4222-8222-222222222222/topic/bugs",
      draftType: "stream",
      draftTo: ["22222222-2222-4222-8222-222222222222"],
      draftTopic: "bugs",
    });
  });

  it("returns null when stream target cannot be resolved", () => {
    expect(resolveForwardDraftTarget("missing", "general", undefined, [])).toBeNull();
  });
});

describe("mergeForwardDraftContent", () => {
  it("returns only forwarded content when target draft is empty", () => {
    expect(mergeForwardDraftContent("@_**Alice**\n```quote\nHi\n```\n\n", undefined)).toBe(
      "@_**Alice**\n```quote\nHi\n```\n\n",
    );
  });

  it("prepends forwarded quote to existing draft content", () => {
    expect(mergeForwardDraftContent("@_**Alice**\n```quote\nHi\n```\n\n", "Existing text")).toBe(
      "@_**Alice**\n```quote\nHi\n```\n\n\n\nExisting text",
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
