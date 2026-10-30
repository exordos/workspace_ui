// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetMessengerConversationPositions } from "~/entities/messenger/messenger-conversation-position.lib";
import { conversationIdForTopic } from "~/entities/messenger/messenger-ids.lib";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceMessageListScroll } from "./workspace-message-list-scroll.hook";

const streamUuid = "11111111-1111-4111-8111-111111111111";
const topicUuid = "22222222-2222-4222-8222-222222222222";
const conversationA = conversationIdForTopic(streamUuid, topicUuid);
const conversationB = conversationIdForTopic(streamUuid, "33333333-3333-4333-8333-333333333333");
interface Message {
  key: string;
  read: boolean;
}
const getMessageKey = (message: Message) => message.key;
const isUnreadCandidate = (message: Message) => !message.read;
const messages: Message[] = Array.from({ length: 10 }, (_, index) => ({
  key: `message-${index}`,
  read: false,
}));

function Harness({
  conversationId,
  items = messages,
  initialPositionReady = true,
  hasNewerMessages = false,
  isLoadingNewer = false,
  tailOutsideWindow = false,
  anchorHandoffPending = false,
  anchorNavigationActive = false,
  hasOlderMessages = false,
  isLoadingOlder = false,
  onLoadOlder,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
}: {
  readonly conversationId: MessengerConversationId;
  readonly items?: Message[];
  readonly initialPositionReady?: boolean;
  readonly hasNewerMessages?: boolean;
  readonly isLoadingNewer?: boolean;
  readonly tailOutsideWindow?: boolean;
  readonly anchorHandoffPending?: boolean;
  readonly anchorNavigationActive?: boolean;
  readonly hasOlderMessages?: boolean;
  readonly isLoadingOlder?: boolean;
  readonly onLoadOlder?: () => void;
  readonly onUnreadMessagesVisible?: (messageKeys: string[]) => void;
  readonly onUnreadMessagesAtBottom?: (messageKeys: string[]) => void;
}) {
  const [control, setControl] = useState({ conversationId, cancelled: false });
  const [layoutRevision, setLayoutRevision] = useState(0);
  if (control.conversationId !== conversationId) {
    setControl({ conversationId, cancelled: false });
  }
  const {
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handleTouchMove,
    isAtBottom,
    refreshMessageLayout,
    preserveMessageLayout,
  } = useWorkspaceMessageListScroll({
    initialPositionReady,
    initialPositionCancelled: control.conversationId === conversationId && control.cancelled,
    onUserScrollInput: () => setControl({ conversationId, cancelled: true }),
    conversationId,
    messages: items,
    getMessageKey,
    isUnreadCandidate,
    scrollToBottomKey: conversationId,
    firstUnreadKey: items.find(isUnreadCandidate)?.key,
    unreadCount: items.filter(isUnreadCandidate).length,
    hasNewerMessages,
    isLoadingNewer,
    tailOutsideWindow,
    anchorHandoffPending,
    anchorNavigationActive,
    hasOlderMessages,
    isLoadingOlder,
    onLoadOlder,
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
  });
  return (
    <>
      <button type="button" onClick={refreshMessageLayout} data-at-bottom={String(isAtBottom)}>
        Refresh layout
      </button>
      <button
        type="button"
        onClick={() => {
          preserveMessageLayout();
          setLayoutRevision((current) => current + 1);
        }}
      >
        Collapse history
      </button>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        data-testid="viewport"
        data-layout-revision={layoutRevision}
      >
        {items.map((message, index) => (
          <div
            key={message.key}
            data-message-uuid={message.key}
            data-message-render-key={message.key}
            data-message-read-boundary={message.key}
            data-index={index}
          />
        ))}
      </div>
    </>
  );
}

let generation = 0;
const scrollIntoView = vi.fn();
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  generation += 1;
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(useWorkspaceAuthStore.getState(), "getCurrentRuntimeContext").mockReturnValue({
    accountId: "account",
    instanceId: "instance",
    organizationId: "organization",
    projectId: "project",
    userUuid: "user",
    organizationOrigin: "https://example.test",
    accessToken: "test",
    runtimeGeneration: generation,
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const isRoot = this.dataset.testid === "viewport";
    const top = isRoot
      ? 0
      : Number(this.dataset.index) * 100 - (this.parentElement?.scrollTop ?? 0);
    const height = isRoot ? 200 : 100;
    return {
      x: 0,
      y: top,
      width: 100,
      height,
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      toJSON: () => ({}),
    };
  });
  scrollIntoView.mockReset();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("ResizeObserver", undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollIntoView != null) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});

function saveScroll(top: number) {
  const root = screen.getByTestId("viewport");
  root.scrollTop = top;
  fireEvent.scroll(root);
  return root;
}

it("preserves upward scroll intent when a short new group refreshes the layout near the tail", () => {
  const items = messages.map((message) => ({ ...message, read: true }));
  const view = render(<Harness conversationId={conversationA} items={items} />);
  const root = screen.getByTestId("viewport");
  root.scrollTop = 800;

  // Wheel intent arrives before the browser changes scrollTop.
  fireEvent.wheel(root, { deltaY: -1 });
  const withServiceGroup = [...items, { key: "new-service-group", read: true }];
  const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1040);
  view.rerender(<Harness conversationId={conversationA} items={withServiceGroup} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh layout" }));
  expect(root.scrollTop).toBe(800);
  expect(
    screen.getByRole("button", { name: "Refresh layout" }).getAttribute("data-at-bottom"),
  ).toBe("true");

  scrollHeight.mockReturnValue(1140);
  view.rerender(
    <Harness
      conversationId={conversationA}
      items={[...withServiceGroup, { key: "next-message", read: true }]}
    />,
  );
  expect(root.scrollTop).toBe(800);
});

it("preserves the visible message offset when completed history shrinks above the viewport", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const isRoot = this.dataset.testid === "viewport";
    const reduction = this.parentElement?.dataset.layoutRevision === "1" ? 300 : 0;
    const top = isRoot
      ? 0
      : Number(this.dataset.index) * 100 - (this.parentElement?.scrollTop ?? 0) - reduction;
    const height = isRoot ? 200 : 100;
    return {
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      toJSON: () => ({}),
    };
  });
  render(
    <Harness
      conversationId={conversationA}
      items={messages.map((message) => ({ ...message, read: true }))}
    />,
  );
  const root = saveScroll(325);
  const anchor = root.querySelector<HTMLElement>("[data-message-render-key='message-3']");
  if (anchor == null) throw new Error("Expected visible anchor");
  const before = anchor.getBoundingClientRect().top;
  fireEvent.click(screen.getByRole("button", { name: "Collapse history" }));
  expect(root.scrollTop).toBe(25);
  expect(anchor.getBoundingClientRect().top).toBe(before);
});

describe("asynchronous message layout", () => {
  function observeMessageLayout() {
    const observers: TestResizeObserver[] = [];
    class TestResizeObserver implements ResizeObserver {
      readonly observed = new Set<Element>();
      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(target: Element) {
        this.observed.add(target);
      }
      unobserve(target: Element) {
        this.observed.delete(target);
      }
      disconnect() {
        this.observed.clear();
      }
      emit(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          this,
        );
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    let growth = 0;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 1000 + growth);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isRoot = this.dataset.testid === "viewport";
      const index = Number(this.dataset.index);
      const contentShift = index > 0 ? growth : 0;
      const messageHeight = 100 + (index === 0 ? growth : 0);
      const top = isRoot ? 0 : index * 100 + contentShift - (this.parentElement?.scrollTop ?? 0);
      const height = isRoot ? 200 : messageHeight;
      return {
        x: 0,
        y: top,
        width: 100,
        height,
        top,
        bottom: top + height,
        left: 0,
        right: 100,
        toJSON: () => ({}),
      };
    });
    return {
      observers,
      resize(root: HTMLElement, delta: number, beforeNotify?: () => void) {
        const first = root.querySelector<HTMLElement>("[data-message-render-key]");
        const observer = observers.findLast((candidate) => candidate.observed.has(root));
        if (first == null || observer == null) throw new Error("Expected observed message");
        expect(observer.observed.has(first)).toBe(true);
        growth = delta;
        beforeNotify?.();
        act(() => observer.emit(first));
      },
    };
  }

  it.each([120, -120])(
    "preserves the visible message offset when a child changes height by %s",
    (delta) => {
      const layout = observeMessageLayout();
      render(<Harness conversationId={conversationA} />);
      const root = saveScroll(325);
      const anchor = root.querySelector<HTMLElement>("[data-message-render-key='message-3']");
      if (anchor == null) throw new Error("Expected visible anchor");
      const before = anchor.getBoundingClientRect().top;
      layout.resize(root, delta);
      expect(root.scrollTop).toBe(325 + delta);
      expect(anchor.getBoundingClientRect().top).toBe(before);
    },
  );

  it("preserves the pre-change offset when React commits before the resize notification", () => {
    const layout = observeMessageLayout();
    const view = render(<Harness conversationId={conversationA} />);
    const root = saveScroll(325);
    const anchor = root.querySelector<HTMLElement>("[data-message-render-key='message-3']");
    if (anchor == null) throw new Error("Expected visible anchor");
    const before = anchor.getBoundingClientRect().top;

    // A key grant changes prepared content without changing the message identities.
    layout.resize(root, 120, () => view.rerender(<Harness conversationId={conversationA} />));

    expect(root.scrollTop).toBe(445);
    expect(anchor.getBoundingClientRect().top).toBe(before);
  });

  it("follows the tail when a child expands without a viewport resize", () => {
    const layout = observeMessageLayout();
    render(
      <Harness
        conversationId={conversationA}
        items={messages.map((message) => ({ ...message, read: true }))}
      />,
    );
    const root = saveScroll(800);
    layout.resize(root, 120);
    expect(root.scrollTop).toBe(1120);
  });

  it.each(["wheel", "touch"] as const)(
    "keeps %s intent when a child expands before the browser scroll event",
    (input) => {
      const layout = observeMessageLayout();
      render(
        <Harness
          conversationId={conversationA}
          items={messages.map((message) => ({ ...message, read: true }))}
        />,
      );
      const root = saveScroll(800);
      if (input === "wheel") fireEvent.wheel(root, { deltaY: -1 });
      else fireEvent.touchMove(root);
      layout.resize(root, 120);
      expect(root.scrollTop).toBe(920);
    },
  );

  it("does not apply a queued tail pin after an upward wheel gesture", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    render(
      <Harness
        conversationId={conversationA}
        items={messages.map((message) => ({ ...message, read: true }))}
      />,
    );
    const root = saveScroll(800);
    fireEvent.wheel(root, { deltaY: -1 });
    root.scrollTop = 790;
    act(() => {
      const pending = frames.splice(0);
      for (const callback of pending) callback(0);
    });
    expect(root.scrollTop).toBe(790);
  });

  it("leaves compensation to an active prepend snapshot", () => {
    const layout = observeMessageLayout();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    const loadOlder = vi.fn();
    render(<Harness conversationId={conversationA} hasOlderMessages onLoadOlder={loadOlder} />);
    act(() => {
      while (frames.length > 0) {
        const pending = frames.splice(0);
        for (const callback of pending) callback(0);
      }
    });
    const root = saveScroll(75);
    fireEvent.wheel(root, { deltaY: -1 });
    fireEvent.scroll(root);
    expect(loadOlder).toHaveBeenCalledOnce();
    layout.resize(root, 120);
    expect(root.scrollTop).toBe(75);
  });

  it("ignores a disconnected observer during an anchor handoff", () => {
    const layout = observeMessageLayout();
    const view = render(<Harness conversationId={conversationA} />);
    const root = saveScroll(325);
    const observer = layout.observers.at(-1);
    if (observer == null) throw new Error("Expected layout observer");
    view.rerender(<Harness conversationId={conversationA} anchorHandoffPending />);
    root.scrollTop = 400;
    act(() => observer.emit(root));
    expect(root.scrollTop).toBe(400);
    expect(observer.observed.size).toBe(0);
  });

  it("does not compensate while navigation is still resolving its focus target", () => {
    const layout = observeMessageLayout();
    const view = render(<Harness conversationId={conversationA} />);
    const root = saveScroll(325);
    view.rerender(<Harness conversationId={conversationA} anchorNavigationActive />);
    layout.resize(root, 120);
    expect(root.scrollTop).toBe(325);
  });
});

describe("read receipts after focus", () => {
  it.each(["focus", "visibilitychange"])(
    "retries topic reads at the tail after %s when loaded messages are already read",
    (eventName) => {
      const hasFocus = vi.mocked(document.hasFocus).mockReturnValue(false);
      const onUnreadMessagesAtBottom = vi.fn();
      render(
        <Harness
          conversationId={conversationA}
          items={messages.map((message) => ({ ...message, read: true }))}
          onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
        />,
      );
      onUnreadMessagesAtBottom.mockClear();

      hasFocus.mockReturnValue(true);
      fireEvent(eventName === "focus" ? window : document, new Event(eventName));

      expect(onUnreadMessagesAtBottom).toHaveBeenCalledOnce();
    },
  );

  it("does not consume the bottom read attempt while the window is inactive", () => {
    const hasFocus = vi.mocked(document.hasFocus).mockReturnValue(false);
    const onUnreadMessagesAtBottom = vi.fn();
    render(
      <Harness
        conversationId={conversationA}
        items={messages.map((message) => ({ ...message, read: true }))}
        onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
      />,
    );

    expect(onUnreadMessagesAtBottom).not.toHaveBeenCalled();
    hasFocus.mockReturnValue(true);
    saveScroll(800);
    expect(onUnreadMessagesAtBottom).toHaveBeenCalledOnce();
  });

  it("retries an unchanged tail when focus returns after a previous attempt", () => {
    const hasFocus = vi.mocked(document.hasFocus);
    const onUnreadMessagesAtBottom = vi.fn();
    render(
      <Harness
        conversationId={conversationA}
        items={messages.map((message) => ({ ...message, read: true }))}
        onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
      />,
    );
    expect(onUnreadMessagesAtBottom).toHaveBeenCalledOnce();
    onUnreadMessagesAtBottom.mockClear();
    hasFocus.mockReturnValue(false);
    fireEvent.blur(window);

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);

    expect(onUnreadMessagesAtBottom).toHaveBeenCalledOnce();
  });

  it("only reports visible unread messages when focus returns in history", () => {
    const onUnreadMessagesVisible = vi.fn();
    const onUnreadMessagesAtBottom = vi.fn();
    render(
      <Harness
        conversationId={conversationA}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
        onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
      />,
    );
    saveScroll(300);
    onUnreadMessagesVisible.mockClear();
    onUnreadMessagesAtBottom.mockClear();

    fireEvent.focus(window);

    expect(onUnreadMessagesVisible).toHaveBeenCalledExactlyOnceWith(["message-3", "message-4"]);
    expect(onUnreadMessagesAtBottom).not.toHaveBeenCalled();
  });

  it.each([{ hasNewerMessages: true }, { isLoadingNewer: true }, { tailOutsideWindow: true }])(
    "keeps unread receipts within the loaded viewport with %j",
    (pagination) => {
      const onUnreadMessagesVisible = vi.fn();
      const onUnreadMessagesAtBottom = vi.fn();
      render(
        <Harness
          conversationId={conversationA}
          items={messages.map((message, index) => ({ ...message, read: index !== 9 }))}
          onUnreadMessagesVisible={onUnreadMessagesVisible}
          onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
          {...pagination}
        />,
      );
      saveScroll(800);
      onUnreadMessagesVisible.mockClear();
      onUnreadMessagesAtBottom.mockClear();

      fireEvent.focus(window);

      expect(onUnreadMessagesVisible).toHaveBeenCalledExactlyOnceWith(["message-9"]);
      expect(onUnreadMessagesAtBottom).not.toHaveBeenCalled();
    },
  );
});

describe("session conversation position", () => {
  it.each(["wheel", "touch"] as const)(
    "preserves the reader position after %s input while fresh history is pending",
    (input) => {
      const cached = messages.map((message) => ({ ...message, read: true }));
      const view = render(
        <Harness conversationId={conversationA} items={cached} initialPositionReady={false} />,
      );
      const root = screen.getByTestId("viewport");
      if (input === "wheel") fireEvent.wheel(root, { deltaY: -100 });
      else fireEvent.touchMove(root);
      saveScroll(325);
      scrollIntoView.mockClear();
      view.rerender(
        <Harness conversationId={conversationA} items={messages} initialPositionReady />,
      );
      expect(root.scrollTop).toBe(325);
      expect(scrollIntoView).not.toHaveBeenCalled();
    },
  );

  it("restores a middle message and its offset when the same list switches away and back", () => {
    const view = render(<Harness conversationId={conversationA} />);
    saveScroll(325);
    view.rerender(
      <Harness
        conversationId={conversationB}
        items={messages.map((message) => ({ ...message, key: `other-${message.key}` }))}
      />,
    );
    saveScroll(650);
    view.rerender(<Harness conversationId={conversationA} />);
    expect(screen.getByTestId("viewport").scrollTop).toBe(325);
  });

  it("falls back to the unread boundary if the saved message is no longer loaded", () => {
    const view = render(<Harness conversationId={conversationA} />);
    saveScroll(325);
    view.rerender(<Harness conversationId={conversationB} />);
    scrollIntoView.mockClear();
    view.rerender(<Harness conversationId={conversationA} items={messages.slice(5)} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).dataset.messageUuid).toBe("message-5");
  });

  it("opens at the bottom after explicit read-all invalidates the saved position", () => {
    const view = render(<Harness conversationId={conversationA} />);
    saveScroll(325);
    forgetMessengerConversationPositions({ streamUuid, topicUuid });
    // A delayed programmatic scroll must not revive the retired position.
    saveScroll(350);
    view.rerender(<Harness conversationId={conversationB} />);
    view.rerender(
      <Harness
        conversationId={conversationA}
        items={messages.map((message) => ({ ...message, read: true }))}
      />,
    );
    expect(screen.getByTestId("viewport").scrollTop).toBe(1000);
  });

  it("opens at newly arrived unread messages after returning from the saved bottom", () => {
    const view = render(<Harness conversationId={conversationA} />);
    saveScroll(800);
    view.rerender(<Harness conversationId={conversationB} />);
    scrollIntoView.mockClear();
    view.rerender(
      <Harness
        conversationId={conversationA}
        items={[...messages, { key: "new-message", read: false }]}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).dataset.messageUuid).toBe(
      "new-message",
    );
  });
});
