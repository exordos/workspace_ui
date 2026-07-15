import { describe, expect, it } from "vitest";
import {
  addWorkspaceReplyTab,
  buildWorkspaceReplyMarkdown,
  removeWorkspaceReplyTab,
  replyToWorkspaceReply,
  selectWorkspaceReplyTab,
  setWorkspaceReplyAnswer,
} from "./workspace-reply.lib";
import { createWorkspaceReplyTab } from "./workspace-reply.model";
import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTab,
} from "./workspace-reply.types";

const quoteA: WorkspaceReplyQuote = {
  messageUuid: "message-a",
  senderUuid: "user-a",
  senderName: "Алексей",
  quotedContent: "текст А",
};

const quoteB: WorkspaceReplyQuote = {
  messageUuid: "message-b",
  senderUuid: "user-b",
  senderName: "Мария",
  quotedContent: "текст Б",
};

const quoteC: WorkspaceReplyQuote = {
  messageUuid: "message-c",
  senderUuid: "user-c",
  senderName: "Иван",
  quotedContent: "текст В",
};

function tab(quote: WorkspaceReplyQuote, id: string, answer: string): WorkspaceReplyTab {
  const created = createWorkspaceReplyTab(quote, {
    id,
    createdAt: `2026-07-14T10:0${{ a: "0", b: "1", c: "2" }[id.at(-1) ?? ""] ?? "9"}:00Z`,
  });
  if (created == null) throw new Error("Test tab could not be created");
  return { ...created, answer };
}

function session(...tabs: WorkspaceReplyTab[]): WorkspaceReplySession {
  return { tabs, activeTabId: tabs[0]?.id ?? null };
}

describe("workspace-reply.lib", () => {
  it("creates the first tab for Reply and preserves its active state", () => {
    expect(
      replyToWorkspaceReply({ tabs: [], activeTabId: null }, quoteA, {
        id: "tab-a",
        createdAt: "2026-07-14T10:00:00Z",
      }),
    ).toEqual({ tabs: [tab(quoteA, "tab-a", "")], activeTabId: "tab-a" });
  });

  it("replaces only the active quote and keeps answer, id, and position", () => {
    const current = session(tab(quoteA, "tab-a", "ответ А"), tab(quoteB, "tab-b", "ответ Б"));
    const next = replyToWorkspaceReply(current, quoteC, {
      id: "ignored-for-existing-tab",
      createdAt: "2026-07-14T11:00:00Z",
    });

    expect(next.tabs).toEqual([
      {
        ...tab(quoteA, "tab-a", "ответ А"),
        messageUuid: "message-c",
        senderUuid: "user-c",
        senderName: "Иван",
        quotedContent: "текст В",
      },
      tab(quoteB, "tab-b", "ответ Б"),
    ]);
    expect(next.activeTabId).toBe("tab-a");
  });

  it("replaces the active quote with another tab's source without moving or merging tabs", () => {
    const current = {
      ...session(
        tab(quoteA, "tab-a", "ответ А"),
        tab(quoteB, "tab-b", "ответ Б"),
        tab(quoteC, "tab-c", "ответ В"),
      ),
      activeTabId: "tab-b",
    };
    const next = replyToWorkspaceReply(current, quoteA, {
      id: "ignored-for-existing-tab",
      createdAt: "2026-07-14T11:00:00Z",
    });

    expect(next).toEqual({
      tabs: [
        tab(quoteA, "tab-a", "ответ А"),
        tab(quoteA, "tab-b", "ответ Б"),
        tab(quoteC, "tab-c", "ответ В"),
      ],
      activeTabId: "tab-b",
    });
    expect(next.tabs[1]?.id).toBe("tab-b");
    expect(next.tabs[1]?.answer).toBe("ответ Б");
  });

  it("adds a new active tab with an empty answer and leaves old answers intact", () => {
    const current = session(tab(quoteA, "tab-a", "ответ А"));
    expect(
      addWorkspaceReplyTab(current, quoteB, { id: "tab-b", createdAt: "2026-07-14T10:01:00Z" }),
    ).toEqual({
      tabs: [tab(quoteA, "tab-a", "ответ А"), tab(quoteB, "tab-b", "")],
      activeTabId: "tab-b",
    });
  });

  it("adds both tabs when their source message is the same", () => {
    const current = session(tab(quoteA, "tab-a", "ответ А"));

    expect(
      addWorkspaceReplyTab(current, quoteA, {
        id: "tab-b",
        createdAt: "2026-07-14T10:01:00Z",
      }),
    ).toEqual({
      tabs: [tab(quoteA, "tab-a", "ответ А"), tab(quoteA, "tab-b", "")],
      activeTabId: "tab-b",
    });
  });

  it("does not add an empty message or duplicate local tab id", () => {
    const current = session(tab(quoteA, "tab-a", "ответ А"));
    expect(
      addWorkspaceReplyTab(
        current,
        { ...quoteB, messageUuid: "   " },
        { id: "tab-empty", createdAt: "2026-07-14T10:01:00Z" },
      ),
    ).toEqual(current);
    expect(
      addWorkspaceReplyTab(current, quoteB, { id: "tab-a", createdAt: "2026-07-14T10:01:00Z" }),
    ).toEqual(current);
  });

  it("switches tabs and updates only the active answer", () => {
    const current = session(tab(quoteA, "tab-a", "ответ А"), tab(quoteB, "tab-b", ""));
    const switched = selectWorkspaceReplyTab(current, "tab-b");
    const updated = setWorkspaceReplyAnswer(switched, "ответ Б");

    expect(updated).toEqual({
      tabs: [tab(quoteA, "tab-a", "ответ А"), tab(quoteB, "tab-b", "ответ Б")],
      activeTabId: "tab-b",
    });
    expect(selectWorkspaceReplyTab(updated, "tab-a").tabs).toEqual(updated.tabs);
  });

  it("removes active and inactive tabs and closes after the last tab", () => {
    const current = session(
      tab(quoteA, "tab-a", "ответ А"),
      tab(quoteB, "tab-b", "ответ Б"),
      tab(quoteC, "tab-c", "ответ В"),
    );
    expect(removeWorkspaceReplyTab(current, "tab-b")).toEqual({
      tabs: [tab(quoteA, "tab-a", "ответ А"), tab(quoteC, "tab-c", "ответ В")],
      activeTabId: "tab-a",
    });
    expect(removeWorkspaceReplyTab({ ...current, activeTabId: "tab-b" }, "tab-b")).toEqual({
      tabs: [tab(quoteA, "tab-a", "ответ А"), tab(quoteC, "tab-c", "ответ В")],
      activeTabId: "tab-c",
    });
    expect(removeWorkspaceReplyTab(session(tab(quoteA, "tab-a", "ответ А")), "tab-a")).toEqual({
      tabs: [],
      activeTabId: null,
    });
  });

  it("serializes duplicate source messages and answers in the current tab order", () => {
    const first = tab(quoteA, "tab-a", "ответ А");
    const second = { ...tab(quoteA, "tab-b", "  "), selectedText: "фрагмент А" };
    const third = tab(quoteC, "tab-c", "ответ В");

    expect(buildWorkspaceReplyMarkdown([third, second, first])).toBe(
      "> [Иван](urn:user:user-c) [wrote](urn:message:message-c):\n> текст В\n\nответ В\n\n> [Алексей](urn:user:user-a) [wrote](urn:message:message-a):\n> фрагмент А\n\n> [Алексей](urn:user:user-a) [wrote](urn:message:message-a):\n> текст А\n\nответ А",
    );
  });
});
