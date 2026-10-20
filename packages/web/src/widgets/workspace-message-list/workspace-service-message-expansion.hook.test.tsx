// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  createWorkspaceMessageListServerItem,
  groupWorkspaceMessagesByDayAndAuthor,
} from "./workspace-message-list-grouping.lib";
import { useServiceMessageExpansion } from "./workspace-service-message-expansion.hook";

type Options = Parameters<typeof useServiceMessageExpansion>[0];

function message(index: number, service = false): MessengerMessage {
  return {
    uuid: `message-${index}`,
    conversationId: "topic:stream:topic",
    projectId: "project",
    streamUuid: "stream",
    topicUuid: "topic",
    authorUuid: "peer",
    userUuid: "peer",
    payload: service
      ? { kind: "key_announced", keyUuid: "key" }
      : { kind: "markdown", content: `Reply ${index}` },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: new Date(Date.parse("2026-10-20T09:00:00Z") + index * 60_000).toISOString(),
    updatedAt: "2026-10-20T09:00:00Z",
  };
}

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 500,
    width: 500,
    height,
    toJSON: () => ({}),
  };
}

async function nextFrame() {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
}

let root: HTMLDivElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(0, 200));
});
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
  root.remove();
  vi.restoreAllMocks();
});

function groupNode(uuid: string, top = -200): HTMLDivElement {
  const node = document.createElement("div");
  node.dataset.serviceMessageGroup = "true";
  const anchor = document.createElement("article");
  anchor.dataset.messageUuid = uuid;
  node.append(anchor);
  root.append(node);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect(top, 100));
  return node;
}

function setup(messages: MessengerMessage[], overrides: Partial<Options> = {}) {
  const groupedItems = (items: MessengerMessage[]) => {
    const dayGroups = groupWorkspaceMessagesByDayAndAuthor(
      items.map((item) => createWorkspaceMessageListServerItem(item)),
    );
    return {
      dayGroups,
      items: dayGroups.flatMap((day) => day.authorGroups.flatMap((group) => group.messages)),
    };
  };
  let options: Options = {
    ...groupedItems(messages),
    scope: "current:topic:stream:topic",
    ready: true,
    liveEnabled: true,
    collapseEnabled: true,
    selectionMode: false,
    focusedMessageTarget: null,
    currentUserUuid: "current",
    scrollContainerRef: { current: root },
    preserveMessageLayout: vi.fn(() => true),
    actions: {
      getKeyServiceState: () => ({
        deviceId: "device",
        canManageKeys: true,
        hasKey: true,
        requestStatus: null,
      }),
      getKeyRequestActions: () => [],
    },
    ...overrides,
  };
  const view = renderHook((props: Options) => useServiceMessageExpansion(props), {
    initialProps: options,
  });
  return {
    ...view,
    preserve: options.preserveMessageLayout,
    update: (items: MessengerMessage[], extra: Partial<Options> = {}) => {
      options = { ...options, ...groupedItems(items), ...extra };
      view.rerender(options);
    },
    expanded: (uuid: string) => {
      const group = options.dayGroups
        .flatMap((day) => day.authorGroups)
        .find((item) => item.messages.some((row) => row.key === uuid));
      if (group == null) throw new Error("Group not found");
      return view.result.current.isExpanded(group);
    },
    toggle: (uuid: string) => {
      const group = options.dayGroups
        .flatMap((day) => day.authorGroups)
        .find((item) => item.messages.some((row) => row.key === uuid));
      if (group == null) throw new Error("Group not found");
      act(() => view.result.current.toggle(group));
    },
  };
}

describe("service message automation", () => {
  it("opens only new chains, keeping initial history and its continuations collapsed", () => {
    const view = setup([message(0, true)]);
    expect(view.expanded("message-0")).toBe(false);
    view.update([message(0, true), message(1, true)]);
    expect(view.expanded("message-1")).toBe(false);
    view.update([message(0, true), message(1, true), message(2), message(3, true)]);
    expect(view.expanded("message-3")).toBe(true);
    view.update([
      message(-1, true),
      message(0, true),
      message(1, true),
      message(2),
      message(3, true),
      message(4, true),
    ]);
    expect(view.expanded("message--1")).toBe(false);
    expect(view.expanded("message-4")).toBe(true);
  });

  it("opens the first live chain in an already initialized empty chat", () => {
    const view = setup([]);
    view.update([message(1, true)]);
    expect(view.expanded("message-1")).toBe(true);
  });

  it("treats initial hydration and forward pagination as history", () => {
    const view = setup([], { ready: false, liveEnabled: false });
    view.update([message(1, true)], { ready: true, liveEnabled: true });
    expect(view.expanded("message-1")).toBe(false);
    view.update([message(1, true), message(2), message(3, true)], { liveEnabled: false });
    view.update([message(1, true), message(2), message(3, true)], { liveEnabled: true });
    expect(view.expanded("message-3")).toBe(false);
  });

  it("preserves explicit collapse as a chain grows", () => {
    const view = setup([message(0)]);
    view.update([message(0), message(1, true)]);
    view.toggle("message-1");
    view.update([message(0), message(1, true), message(2, true)]);
    expect(view.expanded("message-2")).toBe(false);
  });

  it("collapses completed automatic chains above the viewport after a reply", async () => {
    const view = setup([message(0)]);
    groupNode("message-1");
    view.update([message(0), message(1, true)]);
    expect(view.expanded("message-1")).toBe(true);
    view.update([message(0), message(1, true), message(2)], { selectionMode: true });
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    expect(view.preserve).not.toHaveBeenCalled();
    view.update([message(0), message(1, true), message(2)], { selectionMode: false });
    await waitFor(() => expect(view.expanded("message-1")).toBe(false));
    expect(view.preserve).toHaveBeenCalledTimes(1);
  });

  it.each([0, 250])("keeps completed chains at viewport position %i expanded", async (top) => {
    const view = setup([message(0)]);
    groupNode("message-1", top);
    view.update([message(0), message(1, true), message(2)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    expect(view.preserve).not.toHaveBeenCalled();
  });

  it("keeps the last chain expanded until the conversation continues", async () => {
    const view = setup([message(0)]);
    groupNode("message-1");
    view.update([message(0), message(1, true)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
  });

  it.each(["manual", "navigation"] as const)(
    "preserves a %s reveal above the viewport",
    async (source) => {
      const view = setup([message(0)]);
      groupNode("message-1");
      view.update([message(0), message(1, true)]);
      if (source === "manual") {
        view.toggle("message-1");
        view.toggle("message-1");
      } else
        view.update([message(0), message(1, true)], {
          focusedMessageTarget: { intentId: 1, messageUuid: "message-1", focusAttempt: 0 },
        });
      view.update([message(0), message(1, true), message(2)], {
        selectionMode: false,
        focusedMessageTarget: null,
      });
      await nextFrame();
      expect(view.expanded("message-1")).toBe(true);
      expect(view.preserve).not.toHaveBeenCalled();
    },
  );

  it.each(["required", "waiting", "unavailable"] as const)(
    "keeps %s chains open",
    async (status) => {
      const view = setup([message(0)], {
        actions: {
          getKeyServiceState: () =>
            status === "unavailable"
              ? null
              : {
                  deviceId: "device",
                  hasKey: false,
                  canManageKeys: false,
                  requestStatus: "pending",
                },
          getKeyRequestActions: () =>
            status === "unavailable"
              ? []
              : [{ label: "Request", onClick: vi.fn(), disabled: status === "waiting" }],
        },
      });
      groupNode("message-1");
      view.update([message(0), message(1, true), message(2)]);
      await nextFrame();
      expect(view.expanded("message-1")).toBe(true);
    },
  );

  it("waits for focused controls to lose focus before collapsing", async () => {
    const view = setup([message(0)]);
    const node = groupNode("message-1");
    node.tabIndex = 0;
    node.focus();
    view.update([message(0), message(1, true), message(2)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    act(() => node.blur());
    await waitFor(() => expect(view.expanded("message-1")).toBe(false));
  });

  it("defers collapse while anchor navigation or pagination is active", async () => {
    const view = setup([message(0)], { collapseEnabled: false });
    groupNode("message-1");
    view.update([message(0), message(1, true), message(2)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    view.update([message(0), message(1, true), message(2)], { collapseEnabled: true });
    await waitFor(() => expect(view.expanded("message-1")).toBe(false));
  });

  it("waits until selected text is released before collapsing history", async () => {
    const view = setup([message(0)]);
    const node = groupNode("message-1");
    node.append(document.createTextNode("Selected event history"));
    const range = document.createRange();
    range.selectNodeContents(node);
    window.getSelection()?.addRange(range);
    view.update([message(0), message(1, true), message(2)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    await waitFor(() => expect(view.expanded("message-1")).toBe(false));
  });

  it("requires a usable scroll anchor and resets preferences on owner or chat changes", async () => {
    const view = setup([message(0)], { preserveMessageLayout: vi.fn(() => false) });
    groupNode("message-1");
    view.update([message(0), message(1, true), message(2)]);
    await nextFrame();
    expect(view.expanded("message-1")).toBe(true);
    view.update([message(0), message(1, true), message(2)], { scope: "other:topic:stream:topic" });
    expect(view.expanded("message-1")).toBe(false);
  });
});
