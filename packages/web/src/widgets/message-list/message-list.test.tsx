import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { createUser } from "~/test/factories";
import { MessageList } from "./message-list.ui";

const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

function msg(id: number, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id,
    sender_id: 42,
    sender_full_name: "Alice",
    stream_id: 10,
    display_recipient: "general",
    channel: "general",
    subject: "bugs",
    content: `<p>Message ${id}</p>`,
    timestamp: 1710000000 + id,
    ...overrides,
  };
}

describe("MessageList focused message behavior", () => {
  const scrollTargets: string[] = [];
  const scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrollTargets.push(this.getAttribute("data-message-id") ?? "");
  });
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  let intersectionCallback:
    | ((entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void)
    | null = null;

  class IntersectionObserverMock implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0.5];
    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(
      callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    ) {
      intersectionCallback = callback;
    }
  }

  beforeEach(() => {
    resetRealmEmojisCacheForTests();
    scrollTargets.length = 0;
    scrollIntoView.mockReset();
    intersectionCallback = null;
    fetchRealmEmojisMock.mockReset();
    fetchRealmEmojisMock.mockResolvedValue([]);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    globalThis.IntersectionObserver = IntersectionObserverMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.IntersectionObserver = originalIntersectionObserver;
    useUsersStore.getState().clear();
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    useChatListStore.getState().setCurrentUserId(null);
  });

  it("marks and scrolls the focused message into view", () => {
    render(
      <MessageList messages={[msg(1), msg(2), msg(3)]} currentUserId={7} focusedMessageId={2} />,
    );

    const focused = screen.getByTestId("message-2");
    expect(focused).toHaveAttribute("data-focused", "true");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTargets).toContain("2");
  });

  it("clears focused highlight after temporary flash duration", () => {
    vi.useFakeTimers();
    try {
      render(
        <MessageList messages={[msg(1), msg(2), msg(3)]} currentUserId={7} focusedMessageId={2} />,
      );
      expect(screen.getByTestId("message-2")).toHaveAttribute("data-focused", "true");

      act(() => {
        vi.advanceTimersByTime(8_000);
      });
      expect(screen.getByTestId("message-2")).toHaveAttribute("data-focused", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("scrolls first unread message into view when no focused message is set", () => {
    render(
      <MessageList
        messages={[msg(1), msg(2), msg(3)]}
        currentUserId={7}
        firstUnreadId={3}
        unreadCount={2}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTargets).toContain("3");
    expect(screen.getByText("Unread messages • 2")).toBeInTheDocument();
  });

  it("prioritizes focused message over first unread scrolling", () => {
    render(
      <MessageList
        messages={[msg(1), msg(2), msg(3)]}
        currentUserId={7}
        firstUnreadId={3}
        unreadCount={2}
        focusedMessageId={2}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTargets).toContain("2");
    expect(scrollTargets).not.toContain("3");
  });

  it("calls topic separator callback when separator is clicked", () => {
    const onTopicSeparatorClick = vi.fn();

    render(
      <MessageList
        messages={[
          msg(1, { sender_id: 42, subject: "bugs" }),
          msg(2, { sender_id: 43, subject: "bugs" }),
          msg(3, { sender_id: 42, subject: "support" }),
        ]}
        callbacks={{ onTopicSeparatorClick }}
      />,
    );

    const separator = screen.getByRole("button", { name: "support" });
    fireEvent.click(separator);

    expect(onTopicSeparatorClick).toHaveBeenCalledTimes(1);
    expect(onTopicSeparatorClick.mock.calls[0]?.[0]?.id).toBe(3);
  });

  it("shows topic separator when topic changes across calendar days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-02T12:00:00Z"));
    const day1 = Math.floor(new Date("2024-06-01T10:00:00Z").getTime() / 1000);
    const day2 = Math.floor(new Date("2024-06-02T10:00:00Z").getTime() / 1000);

    render(
      <MessageList
        messages={[
          msg(1, { subject: "bugs", timestamp: day1 }),
          msg(2, { subject: "support", timestamp: day2, sender_id: 43 }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "support" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("calls author callback when message avatar is clicked", () => {
    const onMessageAuthorClick = vi.fn();

    render(<MessageList messages={[msg(1)]} callbacks={{ onMessageAuthorClick }} />);

    fireEvent.click(screen.getByRole("button", { name: /open profile/i }));
    expect(onMessageAuthorClick).toHaveBeenCalledTimes(1);
    expect(onMessageAuthorClick).toHaveBeenCalledWith(42);
  });

  it("opens user mention card and calls onOpenDirectMessage", async () => {
    const onOpenDirectMessage = vi.fn();
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 99,
        full_name: "Bob",
      }),
    );

    render(
      <MessageList
        messages={[
          msg(1, {
            content: `<p><span class="user-mention" data-user-id="99">@Bob</span> hi</p>`,
          }),
        ]}
        currentUserId={7}
        callbacks={{ onOpenDirectMessage }}
      />,
    );

    fireEvent.click(screen.getByText("@Bob"));
    expect(await screen.findByRole("dialog", { name: /user mention/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open direct messages/i }));
    expect(onOpenDirectMessage).toHaveBeenCalledTimes(1);
    expect(onOpenDirectMessage).toHaveBeenCalledWith(99);
  });

  it("shows call in mention popover and invokes dm call bridge", async () => {
    const onOpenDirectMessage = vi.fn();
    const invokeDmCall = vi.fn();
    useChatListStore.getState().setCurrentUserId(7);
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(invokeDmCall);
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 99,
        full_name: "Bob",
      }),
    );

    render(
      <MessageList
        messages={[
          msg(1, {
            content: `<p><span class="user-mention" data-user-id="99">@Bob</span> hi</p>`,
          }),
        ]}
        currentUserId={7}
        callbacks={{ onOpenDirectMessage }}
      />,
    );

    fireEvent.click(screen.getByText("@Bob"));
    expect(await screen.findByRole("dialog", { name: /user mention/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^call$/i }));
    expect(invokeDmCall).toHaveBeenCalledTimes(1);
    expect(invokeDmCall).toHaveBeenCalledWith(99);
  });

  it("opens user mention card when body is Zulip Markdown @**Name**", async () => {
    const onOpenDirectMessage = vi.fn();
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 99,
        full_name: "Bob",
      }),
    );

    render(
      <MessageList
        messages={[
          msg(1, {
            content: "Hi @**Bob**",
          }),
        ]}
        currentUserId={7}
        callbacks={{ onOpenDirectMessage }}
      />,
    );

    fireEvent.click(screen.getByText("@Bob"));
    expect(await screen.findByRole("dialog", { name: /user mention/i })).toBeInTheDocument();
    expect(onOpenDirectMessage).not.toHaveBeenCalled();
  });

  it("loads realm custom emojis once when markdown shortcode is present", async () => {
    const { rerender } = render(
      <MessageList
        messages={[
          msg(1, {
            content: "Hi :party_parrot:",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <MessageList
        messages={[
          msg(1, {
            content: "Hi :party_parrot:",
          }),
          msg(2, {
            content: "Still :party_parrot:",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });
  });

  it("loads realm custom emojis and renders reaction image when message has realm_emoji reaction", async () => {
    const realmEmoji = {
      id: "9001",
      names: ["party_parrot"],
      imgUrl: "https://chat.example.test/user_avatars/realm/9001.png",
    };
    fetchRealmEmojisMock.mockResolvedValue([realmEmoji]);
    const { rerender } = render(
      <MessageList
        messages={[
          msg(1, {
            content: "Hi there without emoji shortcodes",
            reactions: [
              {
                emoji_name: "party_parrot",
                emoji_code: "9001",
                reaction_type: "realm_emoji",
                user_id: 42,
              },
            ],
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByAltText(":party_parrot:")).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[
          msg(1, {
            content: "Still no shortcodes",
            reactions: [
              {
                emoji_name: "party_parrot",
                emoji_code: "9001",
                reaction_type: "realm_emoji",
                user_id: 42,
              },
            ],
          }),
          msg(2, {
            content: "No shortcode as well",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does not load realm custom emojis when no shortcode is present", async () => {
    render(
      <MessageList
        messages={[
          msg(1, {
            content: "Hi there without emoji codes",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchRealmEmojisMock).not.toHaveBeenCalled();
    });
  });

  it("uses large avatar size for grouped sender blocks", () => {
    render(<MessageList messages={[msg(1), msg(2)]} currentUserId={7} />);

    const avatarButton = screen.getByRole("button", { name: /open profile/i });
    const avatarElement = avatarButton.querySelector("div");
    expect(avatarElement).toHaveClass("w-12");
    expect(avatarElement).toHaveClass("h-12");
  });

  it("shows grouped sender presence indicator when user presence is available", () => {
    const now = Math.floor(Date.now() / 1000);
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 42,
        full_name: "Alice",
        presence: { status: "active", timestamp: now },
      }),
    );

    render(<MessageList messages={[msg(1), msg(2)]} currentUserId={7} />);

    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
  });

  it("reports unread visible messages at 50% threshold", () => {
    const onUnreadMessagesVisible = vi.fn();
    render(
      <MessageList
        messages={[
          msg(1, { sender_id: 42, flags: [] }),
          msg(2, { sender_id: 42, flags: ["read"] }),
          msg(3, { sender_id: 7, flags: [] }),
        ]}
        currentUserId={7}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );
    onUnreadMessagesVisible.mockClear();

    const targetUnread = screen.getByTestId("message-1");
    const targetRead = screen.getByTestId("message-2");

    intersectionCallback?.(
      [
        { target: targetUnread, isIntersecting: true, intersectionRatio: 0.3 },
      ] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();

    intersectionCallback?.(
      [
        { target: targetUnread, isIntersecting: true, intersectionRatio: 0.7 },
        { target: targetRead, isIntersecting: true, intersectionRatio: 0.9 },
      ] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(onUnreadMessagesVisible).toHaveBeenCalledTimes(1);
    expect(onUnreadMessagesVisible).toHaveBeenCalledWith([1]);
  });

  it("reports viewport unread messages when user scrolls to chat bottom", () => {
    const onUnreadMessagesVisible = vi.fn();
    render(
      <MessageList
        messages={[
          msg(1, { sender_id: 42, flags: [] }),
          msg(2, { sender_id: 43, flags: [] }),
          msg(3, { sender_id: 7, flags: [] }),
        ]}
        currentUserId={7}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const targetUnread1 = screen.getByTestId("message-1");
    const targetUnread2 = screen.getByTestId("message-2");
    intersectionCallback?.(
      [
        { target: targetUnread1, isIntersecting: true, intersectionRatio: 1 },
        { target: targetUnread2, isIntersecting: true, intersectionRatio: 1 },
      ] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    onUnreadMessagesVisible.mockClear();

    const feed = screen.getByRole("feed", { name: /conversation/i });
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 820 });

    fireEvent.scroll(feed);

    expect(onUnreadMessagesVisible).toHaveBeenCalledWith([1, 2]);
  });

  it("does not mark reads at bottom while newer pages are still loading (then marks after scroll up)", () => {
    const onUnreadMessagesVisible = vi.fn();
    render(
      <MessageList
        messages={[
          msg(1, { sender_id: 42, flags: [] }),
          msg(2, { sender_id: 43, flags: [] }),
          msg(3, { sender_id: 7, flags: [] }),
        ]}
        currentUserId={7}
        hasNewerMessages
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const targetUnread1 = screen.getByTestId("message-1");
    const targetUnread2 = screen.getByTestId("message-2");
    intersectionCallback?.(
      [
        { target: targetUnread1, isIntersecting: true, intersectionRatio: 1 },
        { target: targetUnread2, isIntersecting: true, intersectionRatio: 1 },
      ] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    onUnreadMessagesVisible.mockClear();

    const feed = screen.getByRole("feed", { name: /conversation/i });
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 820 });

    fireEvent.scroll(feed);

    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();

    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 400 });
    fireEvent.scroll(feed);
    onUnreadMessagesVisible.mockClear();

    intersectionCallback?.(
      [
        { target: targetUnread1, isIntersecting: true, intersectionRatio: 1 },
        { target: targetUnread2, isIntersecting: true, intersectionRatio: 1 },
      ] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );

    expect(onUnreadMessagesVisible).toHaveBeenCalledWith([1, 2]);
  });

  it("bottom read path only includes viewport unread ids", () => {
    const onUnreadMessagesVisible = vi.fn();
    render(
      <MessageList
        messages={[
          msg(1, { sender_id: 42, flags: [] }),
          msg(2, { sender_id: 43, flags: [] }),
          msg(3, { sender_id: 7, flags: [] }),
        ]}
        currentUserId={7}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const targetUnread2 = screen.getByTestId("message-2");
    intersectionCallback?.(
      [{ target: targetUnread2, isIntersecting: true, intersectionRatio: 1 }] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    onUnreadMessagesVisible.mockClear();

    const feed = screen.getByRole("feed", { name: /conversation/i });
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 820 });

    fireEvent.scroll(feed);

    expect(onUnreadMessagesVisible).toHaveBeenCalledWith([2]);
  });

  it("reports unread messages when list stays at bottom after rerender", async () => {
    const onUnreadMessagesVisible = vi.fn();
    const { rerender } = render(
      <MessageList
        messages={[msg(1, { sender_id: 7, flags: ["read"] })]}
        currentUserId={7}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const feed = screen.getByRole("feed", { name: /conversation/i });
    Object.defineProperty(feed, "scrollHeight", { configurable: true, writable: true, value: 400 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, writable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 0 });

    rerender(
      <MessageList
        messages={[msg(1, { sender_id: 7, flags: ["read"] }), msg(2, { sender_id: 42, flags: [] })]}
        currentUserId={7}
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const targetUnread2 = screen.getByTestId("message-2");
    intersectionCallback?.(
      [{ target: targetUnread2, isIntersecting: true, intersectionRatio: 1 }] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(onUnreadMessagesVisible).toHaveBeenCalledWith([2]);
    });
  });

  it("uses smooth scrolling when the scroll-to-bottom button is clicked", () => {
    render(<MessageList messages={[msg(1), msg(2), msg(3)]} currentUserId={7} />);

    const feed = screen.getByRole("feed", { name: /conversation/i });
    const scrollTo = vi.fn();
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 120 });
    Object.defineProperty(feed, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    fireEvent.scroll(feed);
    fireEvent.click(screen.getByRole("button", { name: /scroll to bottom/i }));

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: "smooth" });
  });
});

describe("MessageList selection mode", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
  });

  it("calls message select callback from selection toggle", () => {
    const onMessageSelect = vi.fn();

    render(
      <MessageList
        messages={[msg(11)]}
        selectionMode
        selectedMessageIds={new Set<number>()}
        callbacks={{ onMessageSelect }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    expect(onMessageSelect).toHaveBeenCalledTimes(1);
    expect(onMessageSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
  });

  it("uses deselect label for already selected message", () => {
    render(
      <MessageList messages={[msg(12)]} selectionMode selectedMessageIds={new Set<number>([12])} />,
    );

    expect(screen.getByRole("button", { name: /deselect/i })).toBeInTheDocument();
  });
});
