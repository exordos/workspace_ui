import { describe, expect, it } from "vitest";
import {
  buildForwardComposeState,
  buildReplyComposeState,
  buildReplySubject,
  extractMailAddress,
  resolveReplyRecipients,
} from "./mail-compose.lib";
import type { MailMessageDetail } from "./mail.types";

function createMessage(overrides: Partial<MailMessageDetail> = {}): MailMessageDetail {
  return {
    uid: 1,
    from: "Alice <alice@example.com>",
    subject: "Hello",
    snippet: "Hi",
    date: "2026-01-01T12:00:00.000Z",
    seen: true,
    flagged: false,
    bodyHtml: null,
    bodyText: "Hi there",
    messageId: "<msg-1@example.com>",
    replyTo: null,
    to: ["Bob <bob@example.com>"],
    cc: ["Carol <carol@example.com>"],
    references: null,
    ...overrides,
  };
}

describe("mail-compose.lib", () => {
  it("extractMailAddress parses angle-bracket form", () => {
    expect(extractMailAddress("Alice <alice@example.com>")).toBe("alice@example.com");
    expect(extractMailAddress("alice@example.com")).toBe("alice@example.com");
  });

  it("buildReplySubject adds Re prefix once", () => {
    expect(buildReplySubject("Hello")).toBe("Re: Hello");
    expect(buildReplySubject("Re: Hello")).toBe("Re: Hello");
  });

  it("resolveReplyRecipients uses reply-to for reply", () => {
    const message = createMessage({ replyTo: "Support <support@example.com>" });
    expect(resolveReplyRecipients(message, "me@example.com", "reply")).toEqual({
      to: "Support <support@example.com>",
      cc: "",
    });
  });

  it("resolveReplyRecipients excludes self for reply all", () => {
    const message = createMessage({
      from: "Alice <alice@example.com>",
      to: ["Me <me@example.com>", "Bob <bob@example.com>"],
      cc: ["Carol <carol@example.com>"],
    });
    const result = resolveReplyRecipients(message, "me@example.com", "replyAll");
    expect(result.to).toContain("alice@example.com");
    expect(result.cc).toContain("bob@example.com");
    expect(result.cc).toContain("carol@example.com");
    expect(result.cc).not.toContain("me@example.com");
  });

  it("buildReplyComposeState includes threading headers", () => {
    const state = buildReplyComposeState(createMessage(), "reply", "me@example.com");
    expect(state.subject).toBe("Re: Hello");
    expect(state.inReplyTo).toBe("<msg-1@example.com>");
    expect(state.references).toBe("<msg-1@example.com>");
    expect(state.bodyHtml).toContain("blockquote");
  });

  it("buildForwardComposeState prefixes subject and quotes body", () => {
    const state = buildForwardComposeState(createMessage());
    expect(state.subject).toBe("Fwd: Hello");
    expect(state.to).toBe("");
    expect(state.bodyHtml).toContain("blockquote");
  });
});
