import { describe, expect, it } from "vitest";
import {
  createWorkspaceReplyTab,
  normalizeWorkspaceReplyQuote,
  normalizeWorkspaceReplySession,
} from "./workspace-reply.model";

const quote = {
  messageUuid: " message-a ",
  senderUuid: " user-a ",
  senderName: " Алексей ",
  quotedContent: "строка 1\r\nстрока 2",
  selectedText: "  выделение  ",
};

describe("workspace-reply.model", () => {
  it("normalizes Workspace quote fields without changing UUID semantics", () => {
    expect(normalizeWorkspaceReplyQuote(quote)).toEqual({
      messageUuid: "message-a",
      senderUuid: "user-a",
      senderName: "Алексей",
      quotedContent: "строка 1\nстрока 2",
      selectedText: "выделение",
    });
  });

  it("creates the first tab with an empty answer", () => {
    expect(
      createWorkspaceReplyTab(quote, { id: "tab-a", createdAt: "2026-07-14T10:00:00Z" }),
    ).toEqual({
      messageUuid: "message-a",
      senderUuid: "user-a",
      senderName: "Алексей",
      quotedContent: "строка 1\nстрока 2",
      selectedText: "выделение",
      id: "tab-a",
      createdAt: "2026-07-14T10:00:00Z",
      answer: "",
    });
  });

  it("keeps duplicate source messages and drops duplicate local tab ids", () => {
    const first = createWorkspaceReplyTab(
      { ...quote, messageUuid: "message-a" },
      { id: "tab-a", createdAt: "2026-07-14T10:00:00Z" },
    );
    const duplicate = createWorkspaceReplyTab(
      { ...quote, messageUuid: " message-a " },
      { id: "tab-duplicate", createdAt: "2026-07-14T10:01:00Z" },
    );
    const second = createWorkspaceReplyTab(
      { ...quote, messageUuid: "message-b" },
      { id: "tab-duplicate", createdAt: "2026-07-14T10:02:00Z" },
    );

    expect(first).not.toBeNull();
    expect(duplicate).not.toBeNull();
    expect(second).not.toBeNull();
    expect(
      normalizeWorkspaceReplySession({
        tabs: [first!, duplicate!, second!],
        activeTabId: "tab-duplicate",
      }),
    ).toMatchObject({
      tabs: [first, duplicate!],
      activeTabId: "tab-duplicate",
    });
  });
});
