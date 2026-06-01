import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetLayoutReconnectCoordinatorForTests,
  scheduleLayoutReconnectRefresh,
} from "./layout-reconnect-coordinator.lib";

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const runChatListBootstrapMock = vi.fn();
const fetchRealmPresenceMock = vi.fn();
const loadInitialMessagesForContextMock = vi.fn();
const lightRefreshMock = vi.fn();
const folderSyncRefreshMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./layout-chat-list-bootstrap.lib", () => ({
  runChatListBootstrap: (...args: unknown[]) => runChatListBootstrapMock(...args),
}));

const stageReconnectStreamPreviewsMock = vi.fn();

vi.mock("./layout-reconnect-stream-preview.lib", () => ({
  stageReconnectStreamPreviews: (...args: unknown[]) => stageReconnectStreamPreviewsMock(...args),
}));

vi.mock("./layout-realm-presence-refresh.lib", () => ({
  refreshRealmPresenceFromApi: vi.fn(),
}));

vi.mock("./layout-active-chat-refresh.lib", () => ({
  refreshActiveChatMessagesFromApi: (...args: unknown[]) => {
    loadInitialMessagesForContextMock(...args);
  },
}));

vi.mock("./layout-reconnect-light.lib", () => ({
  refreshLayoutReconnectLight: (...args: unknown[]) => lightRefreshMock(...args),
}));

vi.mock("~/shared/api/zulip-users", () => ({
  fetchRealmPresence: () => fetchRealmPresenceMock(),
}));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 1,
      setFromMessages: vi.fn(),
      reconcileUnreadFromMessages: vi.fn(),
    }),
  },
}));

vi.mock("~/entities/instance/instance.model", () => ({
  useInstancesStore: {
    getState: () => ({
      currentInstanceId: "inst-1",
    }),
  },
}));

vi.mock("~/features/folder-sync/folder-sync.model", () => ({
  useFolderSyncStore: {
    getState: () => ({
      instanceId: "inst-1",
      refresh: folderSyncRefreshMock,
    }),
  },
}));

describe("scheduleLayoutReconnectRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLayoutReconnectCoordinatorForTests();
    runChatListBootstrapMock.mockResolvedValue({ mode: "none", latestMessageIdHint: null });
    folderSyncRefreshMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetLayoutReconnectCoordinatorForTests();
  });

  it("coalesces multiple full schedules into one bootstrap call", async () => {
    scheduleLayoutReconnectRefresh({ instanceId: "inst-1" }, "full");
    scheduleLayoutReconnectRefresh({ instanceId: "inst-1" }, "full");

    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(runChatListBootstrapMock).toHaveBeenCalledTimes(1);
    expect(runChatListBootstrapMock).toHaveBeenCalledWith(
      "inst-1",
      expect.objectContaining({ kind: "reconnect" }),
    );
    expect(folderSyncRefreshMock).toHaveBeenCalledWith("reconnect");
  });

  it("uses light path with reconnect light refresh", async () => {
    lightRefreshMock.mockResolvedValue(undefined);
    scheduleLayoutReconnectRefresh({ instanceId: "inst-1" }, "light");

    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(runChatListBootstrapMock).not.toHaveBeenCalled();
    expect(lightRefreshMock).toHaveBeenCalledTimes(1);
    expect(folderSyncRefreshMock).not.toHaveBeenCalled();
  });

  it("escalates light then full to full path", async () => {
    runChatListBootstrapMock.mockResolvedValue({
      mode: "streamPreviews",
      messages: [],
      latestMessageIdHint: null,
    });
    scheduleLayoutReconnectRefresh({ instanceId: "inst-1" }, "light");
    scheduleLayoutReconnectRefresh({ instanceId: "inst-1" }, "full");

    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(runChatListBootstrapMock).toHaveBeenCalledTimes(1);
    expect(lightRefreshMock).not.toHaveBeenCalled();
    expect(stageReconnectStreamPreviewsMock).toHaveBeenCalledTimes(1);
  });
});
