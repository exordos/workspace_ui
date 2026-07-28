import { describe, expect, it } from "vitest";
import {
  addWorkspaceReplyTab,
  buildWorkspaceReplyMarkdown,
  removeWorkspaceReplyTab,
  reorderWorkspaceReplyTab,
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

const MESSAGE_A = "11111111-1111-4111-8111-111111111111";
const MESSAGE_B = "22222222-2222-4222-8222-222222222222";
const MESSAGE_C = "33333333-3333-4333-8333-333333333333";

const quoteA: WorkspaceReplyQuote = {
  messageUuid: MESSAGE_A,
  senderUuid: "user-a",
  senderName: "Алексей",
  quotedContent: "текст А",
};

const quoteB: WorkspaceReplyQuote = {
  messageUuid: MESSAGE_B,
  senderUuid: "user-b",
  senderName: "Мария",
  quotedContent: "текст Б",
};

const quoteC: WorkspaceReplyQuote = {
  messageUuid: MESSAGE_C,
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
        messageUuid: MESSAGE_C,
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

  it.each([
    ["start to middle", "tab-a", 2, ["tab-b", "tab-a", "tab-c", "tab-d"]],
    ["start to end", "tab-a", 4, ["tab-b", "tab-c", "tab-d", "tab-a"]],
    ["middle to start", "tab-c", 0, ["tab-c", "tab-a", "tab-b", "tab-d"]],
    ["middle to middle", "tab-c", 1, ["tab-a", "tab-c", "tab-b", "tab-d"]],
    ["middle to end", "tab-c", 4, ["tab-a", "tab-b", "tab-d", "tab-c"]],
    ["end to start", "tab-d", 0, ["tab-d", "tab-a", "tab-b", "tab-c"]],
    ["end to middle", "tab-d", 1, ["tab-a", "tab-d", "tab-b", "tab-c"]],
  ])(
    "moves a tab from %s and preserves the session data",
    (_caseName, tabId, destinationIndex, expectedOrder) => {
      const current = {
        ...session(
          tab(quoteA, "tab-a", "ответ А"),
          tab(quoteB, "tab-b", "ответ Б"),
          tab(quoteC, "tab-c", "ответ В"),
          tab(quoteA, "tab-d", "ответ Г"),
        ),
        activeTabId: "tab-c",
      };
      const originalTabs = current.tabs;
      const originalSession = { ...current, tabs: [...current.tabs] };

      const next = reorderWorkspaceReplyTab(current, tabId, destinationIndex);

      expect(next.tabs.map((item) => item.id)).toEqual(expectedOrder);
      expect(next.activeTabId).toBe("tab-c");
      expect(Object.fromEntries(next.tabs.map((item) => [item.id, item.answer]))).toEqual({
        "tab-a": "ответ А",
        "tab-b": "ответ Б",
        "tab-c": "ответ В",
        "tab-d": "ответ Г",
      });
      expect(current).toEqual(originalSession);
      expect(current.tabs).toBe(originalTabs);
    },
  );

  it("shifts a forward destination index after removing the dragged tab", () => {
    const current = session(
      tab(quoteA, "tab-a", "ответ А"),
      tab(quoteB, "tab-b", "ответ Б"),
      tab(quoteC, "tab-c", "ответ В"),
    );

    expect(reorderWorkspaceReplyTab(current, "tab-a", 2).tabs.map((item) => item.id)).toEqual([
      "tab-b",
      "tab-a",
      "tab-c",
    ]);
  });

  it("returns an equivalent session for a missing tab and a no-op", () => {
    const current = {
      ...session(tab(quoteA, "tab-a", "ответ А"), tab(quoteB, "tab-b", "ответ Б")),
      activeTabId: "tab-b",
    };

    expect(reorderWorkspaceReplyTab(current, "missing-tab", 0)).toEqual(current);
    expect(reorderWorkspaceReplyTab(current, "tab-b", 2)).toEqual(current);
    expect(reorderWorkspaceReplyTab(current, "tab-b", 1)).toEqual(current);
  });

  it("serializes duplicate source messages and answers in the current tab order", () => {
    const first = tab(quoteA, "tab-a", "ответ А");
    const second = { ...tab(quoteA, "tab-b", "  "), selectedText: "фрагмент А" };
    const third = tab(quoteC, "tab-c", "ответ В");

    expect(buildWorkspaceReplyMarkdown([third, second, first])).toBe(
      `[Иван](urn:quote:${MESSAGE_C})\n\nответ В\n\n[Алексей](urn:quote:${MESSAGE_A}?text=%D1%84%D1%80%D0%B0%D0%B3%D0%BC%D0%B5%D0%BD%D1%82%20%D0%90)\n\n[Алексей](urn:quote:${MESSAGE_A})\n\nответ А`,
    );
  });
});
