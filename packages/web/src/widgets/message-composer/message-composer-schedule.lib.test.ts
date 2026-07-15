import { describe, expect, it } from "vitest";
import { buildScheduledComposerMessage } from "./message-composer-schedule.lib";

describe("buildScheduledComposerMessage", () => {
  it("keeps the full outgoing body when the active reply is empty", () => {
    expect(
      buildScheduledComposerMessage({
        id: "scheduled-reply",
        content: "Reply from the first tab\n\nReply from the second tab",
        subject: "Releases",
        value: "",
        files: [],
        canSendWithEmptyActiveValue: true,
        sendAt: 123,
      }),
    ).toEqual({
      id: "scheduled-reply",
      content: "Reply from the first tab\n\nReply from the second tab",
      subject: "Releases",
      files: [],
      sendAt: 123,
    });
  });

  it("rejects a quote-only message when all reply answers are empty", () => {
    expect(
      buildScheduledComposerMessage({
        id: "scheduled-quote-only",
        content: "Quote markup without an answer",
        subject: "Releases",
        value: "",
        files: [],
        canSendWithEmptyActiveValue: false,
        sendAt: 123,
      }),
    ).toBeNull();
  });

  it("preserves ordinary text and files", () => {
    const file = new File(["report"], "report.txt", { type: "text/plain" });

    expect(
      buildScheduledComposerMessage({
        id: "scheduled-text",
        content: "Regular text",
        subject: "",
        value: "Regular text",
        files: [],
        canSendWithEmptyActiveValue: false,
        sendAt: 123,
      }),
    ).toMatchObject({ content: "Regular text", files: [] });

    expect(
      buildScheduledComposerMessage({
        id: "scheduled-file",
        content: "",
        subject: "",
        value: "",
        files: [file],
        canSendWithEmptyActiveValue: false,
        sendAt: 123,
      }),
    ).toMatchObject({ content: "", files: [file] });
  });
});
