import { describe, expect, it } from "vitest";
import {
  buildForwardQuote,
  consumePendingForwardPrefill,
  mergeForwardDraftContent,
  resolveForwardTargetRoute,
  setPendingForwardPrefill,
} from "./chat-forward.lib";

describe("buildForwardQuote", () => {
  it("formats a single forwarded message", () => {
    expect(
      buildForwardQuote([
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
      ]),
    ).toBe("@_**Alice|42**:\n```quote\nHello\n```\n\n");
  });

  it("formats multiple forwarded messages in order", () => {
    expect(
      buildForwardQuote([
        {
          id: 10,
          sender_full_name: "Alice",
          sender_id: 42,
          content: "First",
          stream_id: 32,
          subject: "General",
          display_recipient: "engineering",
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
      ]),
    ).toBe("@_**Alice|42**:\n```quote\nFirst\n```\n\n\n\n@_**Bob|55**:\n```quote\nSecond\n```\n\n");
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
      ),
    ).toBe("@_**Alice|42**:\n```quote\nSelected excerpt\n```\n\n");
  });

  it("uses longer quote fences when forwarded content already contains quote fences", () => {
    expect(
      buildForwardQuote(
        [
          {
            id: 20,
            sender_full_name: "Alice",
            sender_id: 42,
            content: "Original body",
            stream_id: null,
            subject: "",
            display_recipient: [{ id: 42, full_name: "Alice" }],
          },
        ],
        "@_**Bob|55**:\n```quote\nnested\n```",
      ),
    ).toContain("````quote\n@_**Bob|55**:\n```quote\nnested\n```\n````\n\n");
  });

  it("strips html tags from forwarded content payload when markdown_source is missing", () => {
    expect(
      buildForwardQuote([
        {
          id: 1,
          sender_full_name: "Alice",
          sender_id: 42,
          content: "<p>Hello <strong>world</strong></p>",
          stream_id: null,
          subject: "",
          display_recipient: [{ id: 42, full_name: "Alice" }],
        },
      ]),
    ).toBe("@_**Alice|42**:\n```quote\nHello world\n```\n\n");
  });

  it("preserves nested reply quote inside forward payload from markdown_source", () => {
    const nestedMarkdown = `@_**corle|21**:
\`\`\`quote
и тут тоже

дай ссылку на то как приложуху поставить
\`\`\``;

    const result = buildForwardQuote([
      {
        id: 2275,
        sender_full_name: "user",
        sender_id: 9,
        content: "<p>rendered html</p>",
        markdown_source: nestedMarkdown,
        stream_id: 2,
        subject: "general",
        display_recipient: "sandbox",
      },
    ]);

    expect(result).toContain("@_**corle|21**");
    expect(result).toContain("````quote\n@_**corle|21**");
    expect(result).toContain("```quote\nи тут тоже");
    expect(result).toContain("дай ссылку на то как приложуху поставить");
  });

  it("prefers markdown_source over rendered html for forward payload", () => {
    expect(
      buildForwardQuote([
        {
          id: 1,
          sender_full_name: "Alice",
          sender_id: 42,
          content: "<p><strong>Hi</strong></p>",
          markdown_source: "**Hi**",
          stream_id: null,
          subject: "",
          display_recipient: [{ id: 42, full_name: "Alice" }],
        },
      ]),
    ).toBe("@_**Alice|42**:\n```quote\n**Hi**\n```\n\n");
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
            stream_id: 32,
            subject: "General",
            display_recipient: "engineering",
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
      ),
    ).toBe("@_**Alice|42**:\n```quote\nFirst\n```\n\n\n\n@_**Bob|55**:\n```quote\nSecond\n```\n\n");
  });

  it("returns an empty string for empty input", () => {
    expect(buildForwardQuote([])).toBe("");
  });
});

describe("resolveForwardTargetRoute", () => {
  it("returns Workspace topic route for stream target", () => {
    const route = resolveForwardTargetRoute({
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: "stream-uuid",
      topicUuid: "topic-uuid",
    });

    expect(route).toBe("/org/org-a/project/project-a/stream/stream-uuid/topic/topic-uuid");
    expect(route).not.toContain("/dm/");
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
