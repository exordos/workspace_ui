import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import {
  invalidateInstance,
  invalidateStream as invalidateStreamCache,
  loadStreamMembers,
  loadStreamMetadata,
} from "./chat-info.api";
import { useChatInfoStore } from "./chat-info.model";
import type { ChatInfoContext } from "./chat-info.types";

vi.mock("./chat-info.api", () => ({
  loadStreamMembers: vi.fn(),
  loadStreamMetadata: vi.fn(),
  invalidateStream: vi.fn(),
  invalidateInstance: vi.fn(),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function streamContext(
  streamId: number,
  name: string,
  overrides?: Partial<Extract<ChatInfoContext, { kind: "stream" }>>,
): Extract<ChatInfoContext, { kind: "stream" }> {
  return {
    kind: "stream",
    instanceId: "inst-a",
    streamId,
    streamName: name,
    isMuted: false,
    topics: [],
    ...overrides,
  };
}

describe("chat-info model orchestration", () => {
  afterEach(() => {
    useChatInfoStore.getState().clear();
    useUsersStore.getState().clear();
    vi.clearAllMocks();
  });

  it("does not overwrite latest context when an older hydrate resolves later", async () => {
    useUsersStore.getState().mergeUsers([
      { user_id: 1, full_name: "Alice" },
      { user_id: 2, full_name: "Bob" },
    ]);

    const slowMembers = deferred<number[]>();
    const slowMetadata = deferred<{ description: string | null }>();
    vi.mocked(loadStreamMembers).mockImplementation(async (_instanceId, streamId) => {
      if (streamId === 1) {
        return slowMembers.promise;
      }
      return [2];
    });
    vi.mocked(loadStreamMetadata).mockImplementation(async (_instanceId, streamId) => {
      if (streamId === 1) {
        return slowMetadata.promise;
      }
      return { description: "Second stream" };
    });

    const firstContext = streamContext(1, "first");
    const secondContext = streamContext(2, "second");

    const firstHydrate = useChatInfoStore.getState().hydrate(firstContext);
    await Promise.resolve();
    await useChatInfoStore.getState().hydrate(secondContext);

    slowMembers.resolve([1]);
    slowMetadata.resolve({ description: "First stream" });
    await firstHydrate;

    const state = useChatInfoStore.getState();
    expect(state.context).toEqual(secondContext);
    expect(state.data?.type).toBe("stream");
    expect(state.data?.name).toBe("second");
    expect(state.data?.description).toBe("Second stream");
  });

  it("syncDerived updates stream data without additional network calls", async () => {
    useUsersStore.getState().mergeUsers([
      { user_id: 1, full_name: "Alice", presence: { status: "active", timestamp: 1 } },
      { user_id: 2, full_name: "Bob", presence: { status: "idle", timestamp: 2 } },
    ]);
    vi.mocked(loadStreamMembers).mockResolvedValue([1, 2]);
    vi.mocked(loadStreamMetadata).mockResolvedValue({ description: "Initial description" });

    const context = streamContext(10, "engineering");
    await useChatInfoStore.getState().hydrate(context);

    useChatInfoStore.getState().syncDerived({
      ...context,
      isMuted: true,
      topics: [{ name: "release", unreadCount: 3 }],
    });

    const state = useChatInfoStore.getState();
    expect(state.data?.type).toBe("stream");
    expect(state.data?.isMuted).toBe(true);
    expect(state.data?.topics).toEqual([{ name: "release", unreadCount: 3 }]);
    expect(loadStreamMembers).toHaveBeenCalledTimes(1);
    expect(loadStreamMetadata).toHaveBeenCalledTimes(1);
  });

  it("invalidates active stream cache and forces re-hydration", async () => {
    useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });
    vi.mocked(loadStreamMembers).mockResolvedValue([1]);
    vi.mocked(loadStreamMetadata).mockResolvedValue({ description: "Engineering" });

    const context = streamContext(42, "engineering");
    await useChatInfoStore.getState().hydrate(context);
    useChatInfoStore.getState().invalidateStream("inst-a", 42);
    await Promise.resolve();
    await Promise.resolve();

    expect(invalidateStreamCache).toHaveBeenCalledWith("inst-a", 42);
    expect(loadStreamMembers).toHaveBeenCalledTimes(2);
    expect(loadStreamMetadata).toHaveBeenCalledTimes(2);
  });

  it("invalidates old instance caches when context instance changes", () => {
    useChatInfoStore.getState().setContext({
      kind: "dm",
      instanceId: "inst-a",
      dmName: "Alice",
      participantIds: [1],
    });

    useChatInfoStore.getState().setContext({
      kind: "dm",
      instanceId: "inst-b",
      dmName: "Bob",
      participantIds: [2],
    });

    expect(invalidateInstance).toHaveBeenCalledWith("inst-a");
  });
});
