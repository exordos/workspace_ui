import { describe, expect, it } from "vitest";
import { restoreWorkspaceReplySessionFromMarkdown } from "./workspace-reply-restore.lib";
import { buildWorkspaceReplyMarkdown } from "./workspace-reply.lib";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const MESSAGE_A = "33333333-3333-4333-8333-333333333333";
const MESSAGE_B = "44444444-4444-4444-8444-444444444444";

function restore(markdown: string) {
  return restoreWorkspaceReplySessionFromMarkdown(markdown, (index) => ({
    id: `restored-${index}`,
    createdAt: `2026-07-16T10:0${index}:00Z`,
  }));
}

describe("restoreWorkspaceReplySessionFromMarkdown", () => {
  it("restores one canonical Workspace reply", () => {
    const restored = restore(
      [
        `> [Алексей](urn:user:${USER_A}) [wrote](urn:message:${MESSAGE_A}):`,
        "> исходный текст",
        "",
        "ответ",
      ].join("\n"),
    );

    expect(restored).toEqual({
      activeAnswer: "ответ",
      session: {
        activeTabId: "restored-0",
        tabs: [
          expect.objectContaining({
            id: "restored-0",
            messageUuid: MESSAGE_A,
            senderUuid: USER_A,
            senderName: "Алексей",
            quotedContent: "исходный текст",
            answer: "ответ",
          }),
        ],
      },
    });
  });

  it("restores several replies and keeps each answer between quote blocks", () => {
    const markdown = [
      `> [Алексей](urn:user:${USER_A}) [wrote](urn:message:${MESSAGE_A}):`,
      "> цитата А",
      "",
      "ответ А",
      "",
      `> [Мария](urn:user:${USER_B}) [wrote](urn:message:${MESSAGE_B}):`,
      "> цитата Б",
      "",
      "ответ Б",
    ].join("\n");
    const restored = restore(markdown);

    expect(restored?.session.tabs).toEqual([
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        quotedContent: "цитата А",
        answer: "ответ А",
      }),
      expect.objectContaining({
        messageUuid: MESSAGE_B,
        quotedContent: "цитата Б",
        answer: "ответ Б",
      }),
    ]);
    expect(restored?.session.activeTabId).toBe("restored-0");
    expect(buildWorkspaceReplyMarkdown(restored?.session.tabs ?? [])).toBe(markdown);
  });

  it("normalizes CRLF and preserves multiline quote content", () => {
    const restored = restore(
      `> [Алексей](urn:user:${USER_A}) [wrote](urn:message:${MESSAGE_A}):\r\n> первая\r\n> \r\n> вторая\r\n\r\nответ`,
    );

    expect(restored?.session.tabs[0]).toEqual(
      expect.objectContaining({ quotedContent: "первая\n\nвторая", answer: "ответ" }),
    );
  });

  it("does not restore ordinary or malformed quotes", () => {
    expect(restore("> обычная цитата\n\nответ")).toBeNull();
    expect(
      restore(
        `текст\n\n> [Алексей](urn:user:${USER_A}) [wrote](urn:message:${MESSAGE_A}):\n> цитата`,
      ),
    ).toBeNull();
    expect(
      restore(`> [Алексей](urn:user:not-a-uuid) [wrote](urn:message:${MESSAGE_A}):\n> цитата`),
    ).toBeNull();
  });

  it("keeps a canonical-looking quote inside an answer in the active tab", () => {
    const restored = restore(
      [
        `> [Алексей](urn:user:${USER_A}) [wrote](urn:message:${MESSAGE_A}):`,
        "> первая цитата",
        "",
        "ответ с вложенной цитатой:",
        `> [Мария](urn:user:${USER_B}) [wrote](urn:message:${MESSAGE_B}):`,
        "> это часть ответа, а не новая вкладка",
      ].join("\n"),
    );

    expect(restored?.session.tabs).toHaveLength(1);
    expect(restored?.session.tabs[0]?.answer).toContain("это часть ответа");
  });
});
