import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveTypingEventRoute } from "./typing-event-routing";
import {
  EMPTY_TYPING_USERS,
  useTypingIndicatorStore,
  TYPING_EXPIRY_MS,
} from "./typing-indicator.model";
import { buildDmTypingChatKey, buildStreamTypingChatKey } from "./typing-key";

describe("typing-indicator store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTypingIndicatorStore.getState().clearAll();
  });

  afterEach(() => {
    useTypingIndicatorStore.getState().clearAll();
    vi.useRealTimers();
  });

  it("returns empty array for unknown chat key", () => {
    const users = useTypingIndicatorStore.getState().getTypingUsers("unknown");
    expect(users).toEqual([]);
  });

  it("adds a typing user on setTyping(true)", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    const users = useTypingIndicatorStore.getState().getTypingUsers("chat:1");
    expect(users).toHaveLength(1);
    expect(users[0]!.userId).toBe(42);
  });

  it("removes a typing user on setTyping(false)", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, false);
    const users = useTypingIndicatorStore.getState().getTypingUsers("chat:1");
    expect(users).toHaveLength(0);
  });

  it("tracks multiple users typing in the same chat", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    useTypingIndicatorStore.getState().setTyping("chat:1", 99, true);
    const users = useTypingIndicatorStore.getState().getTypingUsers("chat:1");
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.userId).sort()).toEqual([42, 99]);
  });

  it("tracks users typing in different chats independently", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    useTypingIndicatorStore.getState().setTyping("chat:2", 99, true);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(1);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:2")).toHaveLength(1);
  });

  it("auto-expires typing after TYPING_EXPIRY_MS", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(1);

    vi.advanceTimersByTime(TYPING_EXPIRY_MS + 100);

    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(0);
  });

  it("refreshes expiry timer on repeated setTyping(true)", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);

    vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1000);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(1);

    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);

    vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1000);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(1);

    vi.advanceTimersByTime(2000);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(0);
  });

  it("clearAll removes all typing users and timers", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    useTypingIndicatorStore.getState().setTyping("chat:2", 99, true);

    useTypingIndicatorStore.getState().clearAll();

    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(0);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:2")).toHaveLength(0);
    expect(useTypingIndicatorStore.getState().timers.size).toBe(0);
  });

  it("returns stable EMPTY_TYPING_USERS reference for unknown keys", () => {
    const a = useTypingIndicatorStore.getState().getTypingUsers("x");
    const b = useTypingIndicatorStore.getState().getTypingUsers("y");
    expect(a).toBe(b);
    expect(a).toBe(EMPTY_TYPING_USERS);
  });

  it("setTyping(false) for non-existent user is a safe no-op", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 999, false);
    expect(useTypingIndicatorStore.getState().getTypingUsers("chat:1")).toHaveLength(0);
  });

  it("only removes the specified user, others remain", () => {
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, true);
    useTypingIndicatorStore.getState().setTyping("chat:1", 99, true);
    useTypingIndicatorStore.getState().setTyping("chat:1", 42, false);
    const users = useTypingIndicatorStore.getState().getTypingUsers("chat:1");
    expect(users).toHaveLength(1);
    expect(users[0]!.userId).toBe(99);
  });
});

describe("typing chat keys", () => {
  it("builds a stable DM chat key including current user", () => {
    expect(buildDmTypingChatKey([42, 99], 7)).toBe("7,42,99");
  });

  it("deduplicates DM user ids", () => {
    expect(buildDmTypingChatKey([7, 42, 42], 7)).toBe("7,42");
  });

  it("returns null for DM keys without current user", () => {
    expect(buildDmTypingChatKey([42], null)).toBeNull();
  });

  it("builds a stream typing key with empty-topic identity", () => {
    expect(buildStreamTypingChatKey(15, "")).toBe("stream:15:");
    expect(buildStreamTypingChatKey(15, "bugs")).toBe("stream:15:bugs");
  });
});

describe("typing event routing", () => {
  it("routes stream typing events with empty topic to empty-topic key", () => {
    expect(
      resolveTypingEventRoute({
        op: "start",
        messageType: "stream",
        senderUserId: 42,
        streamId: 15,
        topic: "",
        currentUserId: 7,
      }),
    ).toEqual({
      chatKey: "stream:15:",
      userId: 42,
      isTyping: true,
    });
  });

  it("routes stream typing events with missing topic to empty-topic key", () => {
    expect(
      resolveTypingEventRoute({
        op: "stop",
        messageType: "stream",
        senderUserId: 42,
        streamId: 15,
        currentUserId: 7,
      }),
    ).toEqual({
      chatKey: "stream:15:",
      userId: 42,
      isTyping: false,
    });
  });

  it("routes dm typing events using canonical dm chat key", () => {
    expect(
      resolveTypingEventRoute({
        op: "start",
        messageType: "private",
        senderUserId: 42,
        recipients: [{ user_id: 42 }, { user_id: 99 }],
        currentUserId: 7,
      }),
    ).toEqual({
      chatKey: "7,42,99",
      userId: 42,
      isTyping: true,
    });
  });

  it("ignores typing events emitted by current user", () => {
    expect(
      resolveTypingEventRoute({
        op: "start",
        messageType: "private",
        senderUserId: 7,
        recipients: [{ user_id: 42 }],
        currentUserId: 7,
      }),
    ).toBeNull();

    expect(
      resolveTypingEventRoute({
        op: "stop",
        messageType: "stream",
        senderUserId: 7,
        streamId: 15,
        topic: "general",
        currentUserId: 7,
      }),
    ).toBeNull();
  });

  it("returns null for invalid or incomplete typing payloads", () => {
    expect(
      resolveTypingEventRoute({
        op: "noop",
        messageType: "stream",
        senderUserId: 42,
        streamId: 15,
        currentUserId: 7,
      }),
    ).toBeNull();

    expect(
      resolveTypingEventRoute({
        op: "start",
        messageType: "private",
        senderUserId: 42,
        recipients: [{ user_id: 42 }],
        currentUserId: null,
      }),
    ).toBeNull();
  });
});

describe("typing transitions", () => {
  it("starts typing when content becomes non-empty", async () => {
    const { resolveComposerTypingTransition } = await import("./typing-transition");
    expect(resolveComposerTypingTransition("hello", false)).toEqual({
      action: "start",
      nextWasTyping: true,
      restartCooldown: true,
    });
  });

  it("sends stop when content is cleared after typing", async () => {
    const { resolveComposerTypingTransition } = await import("./typing-transition");
    expect(resolveComposerTypingTransition("", true)).toEqual({
      action: "stop",
      nextWasTyping: false,
      restartCooldown: false,
    });
  });

  it("does not start typing for whitespace-only input", async () => {
    const { resolveComposerTypingTransition } = await import("./typing-transition");
    expect(resolveComposerTypingTransition("   ", false)).toEqual({
      action: null,
      nextWasTyping: false,
      restartCooldown: false,
    });
  });

  it("sends stop when user leaves only whitespace after typing", async () => {
    const { resolveComposerTypingTransition } = await import("./typing-transition");
    expect(resolveComposerTypingTransition("   ", true)).toEqual({
      action: "stop",
      nextWasTyping: false,
      restartCooldown: false,
    });
  });

  it("sends stop on idle timeout when typing was active", async () => {
    const { resolveTypingIdleTransition } = await import("./typing-transition");
    expect(resolveTypingIdleTransition(true)).toEqual({
      action: "stop",
      nextWasTyping: false,
    });
  });

  it("does nothing on idle timeout when typing was already inactive", async () => {
    const { resolveTypingIdleTransition } = await import("./typing-transition");
    expect(resolveTypingIdleTransition(false)).toEqual({
      action: null,
      nextWasTyping: false,
    });
  });
});
