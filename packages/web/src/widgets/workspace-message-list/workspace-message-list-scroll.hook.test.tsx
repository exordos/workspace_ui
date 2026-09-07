// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
}: {
  readonly conversationId: MessengerConversationId;
  readonly items?: Message[];
}) {
  const { scrollContainerRef, handleScroll } = useWorkspaceMessageListScroll({
    conversationId,
    messages: items,
    getMessageKey,
    isUnreadCandidate,
    scrollToBottomKey: conversationId,
    firstUnreadKey: items.find(isUnreadCandidate)?.key,
    unreadCount: items.filter(isUnreadCandidate).length,
  });
  return (
    <div ref={scrollContainerRef} onScroll={handleScroll} data-testid="viewport">
      {items.map((message, index) => (
        <div
          key={message.key}
          data-message-uuid={message.key}
          data-message-render-key={message.key}
          data-index={index}
        />
      ))}
    </div>
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

describe("session conversation position", () => {
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
