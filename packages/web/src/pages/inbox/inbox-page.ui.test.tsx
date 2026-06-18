import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { InboxPage } from "./inbox-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchInboxEntries = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const hydrateInboxEntriesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const fetchInboxUnreadSnapshotComplete = vi.hoisted(() => vi.fn(() => true));
const buildUnreadSnapshotFromEntries = vi.hoisted(() => (entries: readonly InboxEntry[]) => {
  const streams = entries
    .filter((entry) => entry.streamId != null)
    .map((entry) => ({
      streamId: entry.streamId!,
      topic: entry.topic ?? "",
      unreadMessageIds: entry.messageIds,
    }));
  const dms = entries
    .filter((entry) => entry.streamId == null)
    .map((entry) => {
      const userIds =
        entry.dmSlug
          ?.split(",")
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)) ?? (entry.senderId != null ? [entry.senderId] : []);
      return {
        userIds,
        unreadMessageIds: entry.messageIds,
        isGroup: userIds.length > 1,
      };
    });
  return {
    streams,
    dms,
    totalCount: entries.reduce((total, entry) => total + entry.unreadCount, 0),
    mentionMessageIds: [],
  };
});
const buildUnreadMessagesFromEntries = vi.hoisted(
  () => (entries: readonly InboxEntry[]) =>
    entries.flatMap((entry) =>
      entry.messageIds.map((messageId): ZulipRawMessage => {
        if (entry.streamId != null) {
          return {
            id: messageId,
            sender_id: entry.senderId ?? 42,
            sender_full_name: entry.senderName ?? "Alice",
            content: "",
            timestamp: entry.lastMessageTimestamp,
            type: "stream",
            stream_id: entry.streamId,
            display_recipient: entry.streamName ?? "engineering",
            subject: entry.topic ?? "",
            flags: [],
          };
        }
        return {
          id: messageId,
          sender_id: entry.senderId ?? 42,
          sender_full_name: entry.senderName ?? "Alice",
          content: "",
          timestamp: entry.lastMessageTimestamp,
          type: "private",
          display_recipient: [
            {
              id: entry.senderId ?? 42,
              full_name: entry.senderName ?? "Alice",
              email: "alice@example.com",
            },
          ],
          flags: [],
        };
      }),
    ),
);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/inbox/inbox.api", async () => {
  const actual = await vi.importActual<typeof import("~/entities/inbox/inbox.api")>(
    "~/entities/inbox/inbox.api",
  );
  return {
    ...actual,
    fetchInboxEntries,
    fetchInboxEntriesWithSnapshot: async (
      currentUserId?: number | null,
      options?: unknown,
      requestOptions?: unknown,
    ) => {
      const entries = (await fetchInboxEntries(
        currentUserId,
        options,
        requestOptions,
      )) as InboxEntry[];
      return {
        entries,
        unreadSnapshot: buildUnreadSnapshotFromEntries(entries),
        unreadSnapshotComplete: fetchInboxUnreadSnapshotComplete(),
        unreadMessages: buildUnreadMessagesFromEntries(entries),
      };
    },
    hydrateInboxEntriesFromCache,
  };
});

const TEST_INSTANCE_ID = "instance-inbox-test";

describe("InboxPage styling contract", () => {
  beforeEach(() => {
    useInstancesStore.setState({
      instances: [
        {
          id: TEST_INSTANCE_ID,
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: TEST_INSTANCE_ID,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  afterEach(() => {
    navigateSpy.mockReset();
    fetchInboxEntries.mockReset();
    fetchInboxUnreadSnapshotComplete.mockReset();
    hydrateInboxEntriesFromCache.mockReset();
    fetchInboxEntries.mockResolvedValue([]);
    fetchInboxUnreadSnapshotComplete.mockReturnValue(true);
    hydrateInboxEntriesFromCache.mockResolvedValue([]);
    useInboxStore.getState().clear();
    useMuteStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  it("renders inbox rows as themed cards for all palettes", async () => {
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Alice",
        dmSlug: "42",
        unreadCount: 2,
        lastMessageTimestamp: 10,
        messageIds: [1, 2],
      },
      {
        key: "stream:10:release",
        streamId: 10,
        streamName: "engineering",
        topic: "release",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 9,
        messageIds: [3],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const dmRow = screen.getByText("Alice").closest("button");
    const streamRow = screen.getByText("#engineering · release").closest("button");

    expect(dmRow).toHaveClass("rounded-xl");
    expect(dmRow).toHaveClass("border");
    expect(dmRow).toHaveClass("border-border-subtle");
    expect(dmRow).toHaveClass("bg-bg-elevated/50");

    expect(streamRow).toHaveClass("rounded-xl");
    expect(streamRow).toHaveClass("border");
    expect(streamRow).toHaveClass("border-border-subtle");
    expect(streamRow).toHaveClass("bg-bg-elevated/50");
  });

  it("renders cached inbox entries immediately while refresh is in flight", () => {
    const cachedEntries = [
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Cached Alice",
        dmSlug: "42",
        unreadCount: 2,
        lastMessageTimestamp: 10,
        messageIds: [1, 2],
      },
    ];

    useInboxStore.setState({
      entries: cachedEntries,
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
      staleVersion: 0,
    });
    fetchInboxEntries.mockResolvedValue(cachedEntries);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Cached Alice")).toBeInTheDocument();
  });

  it("syncs organization unread count from network inbox snapshot", async () => {
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Alice",
        dmSlug: "42",
        unreadCount: 2,
        lastMessageTimestamp: 10,
        messageIds: [1, 2],
      },
      {
        key: "stream:10:release",
        streamId: 10,
        streamName: "engineering",
        topic: "release",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 9,
        messageIds: [3],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useInstancesStore.getState().getInstanceUnreadCount(TEST_INSTANCE_ID)).toBe(3);
    });
  });

  it("does not lower organization unread count from capped network inbox snapshot", async () => {
    useInstancesStore.getState().setInstanceUnreadCount(TEST_INSTANCE_ID, 100);
    fetchInboxUnreadSnapshotComplete.mockReturnValue(false);
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Alice",
        dmSlug: "42",
        unreadCount: 2,
        lastMessageTimestamp: 10,
        messageIds: [1, 2],
      },
      {
        key: "stream:10:release",
        streamId: 10,
        streamName: "engineering",
        topic: "release",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 9,
        messageIds: [3],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(useInstancesStore.getState().getInstanceUnreadCount(TEST_INSTANCE_ID)).toBe(100);
  });

  it("hides cached muted stream entries even when the topic is explicitly unmuted", () => {
    useInboxStore.setState({
      entries: [
        {
          key: "stream:10:release",
          streamId: 10,
          streamName: "engineering",
          topic: "release",
          senderId: null,
          senderName: null,
          dmSlug: null,
          unreadCount: 1,
          lastMessageTimestamp: 100,
          messageIds: [10],
        },
      ],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
      staleVersion: 0,
    });
    useMuteStore.getState().muteStream(10);
    useMuteStore.getState().unmuteTopic(10, "release");
    fetchInboxEntries.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("#engineering · release")).not.toBeInTheDocument();
    expect(screen.getByText("No unread messages")).toBeInTheDocument();
  });

  it("keeps stale refresh soft when cached entries are hidden by mute filters", async () => {
    let resolveFetch: (entries: InboxEntry[]) => void = () => {};
    const fetchPromise = new Promise<InboxEntry[]>((resolve) => {
      resolveFetch = resolve;
    });

    useInboxStore.setState({
      entries: [
        {
          key: "stream:10:release",
          streamId: 10,
          streamName: "engineering",
          topic: "release",
          senderId: null,
          senderName: null,
          dmSlug: null,
          unreadCount: 1,
          lastMessageTimestamp: 100,
          messageIds: [10],
        },
      ],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
      staleVersion: 1,
    });
    useMuteStore.getState().muteStream(10);
    fetchInboxEntries.mockReturnValue(fetchPromise);
    hydrateInboxEntriesFromCache.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("#engineering · release")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByText("No unread messages")).toBeInTheDocument();

    await act(async () => {
      resolveFetch([]);
      await fetchPromise;
    });
  });

  it("keeps current in-memory entries when cache snapshot is older", async () => {
    useInboxStore.setState({
      entries: [
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Fresh Alice",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 300,
          messageIds: [30],
        },
      ],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
      staleVersion: 0,
    });
    hydrateInboxEntriesFromCache.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Old Alice",
        dmSlug: "42",
        unreadCount: 1,
        lastMessageTimestamp: 100,
        messageIds: [10],
      },
    ]);
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Fresh Alice",
        dmSlug: "42",
        unreadCount: 1,
        lastMessageTimestamp: 300,
        messageIds: [30],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchInboxEntries).toHaveBeenCalled();
      expect(screen.getByText("Fresh Alice")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old Alice")).not.toBeInTheDocument();
  });

  it("applies cache snapshot when it is fresher than in-memory entries", async () => {
    useInboxStore.setState({
      entries: [
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Old Alice",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 100,
          messageIds: [10],
        },
      ],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
      staleVersion: 0,
    });
    hydrateInboxEntriesFromCache.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Fresh Alice",
        dmSlug: "42",
        unreadCount: 1,
        lastMessageTimestamp: 300,
        messageIds: [30],
      },
    ]);
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Fresh Alice",
        dmSlug: "42",
        unreadCount: 1,
        lastMessageTimestamp: 300,
        messageIds: [30],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Fresh Alice")).toBeInTheDocument();
    });

    expect(screen.queryByText("Old Alice")).not.toBeInTheDocument();
  });

  it("clears initial loading when mounted with staleVersion > 0 and no cached entries", async () => {
    useInboxStore.setState({ staleVersion: 1 });
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Alice",
        dmSlug: "42",
        unreadCount: 1,
        lastMessageTimestamp: 10,
        messageIds: [1],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("refetches inbox when markStale is called while page is open", async () => {
    fetchInboxEntries
      .mockResolvedValueOnce([
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Initial Alice",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 10,
          messageIds: [1],
        },
      ])
      .mockResolvedValueOnce([
        {
          key: "dm:99",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 99,
          senderName: "New Bob",
          dmSlug: "99",
          unreadCount: 1,
          lastMessageTimestamp: 20,
          messageIds: [2],
        },
      ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Initial Alice")).toBeInTheDocument();
    });

    act(() => {
      useInboxStore.getState().markStale();
    });

    await waitFor(() => {
      expect(screen.getByText("New Bob")).toBeInTheDocument();
    });

    expect(fetchInboxEntries).toHaveBeenCalledTimes(2);
  });

  it("does not apply cached inbox entries from the previous organization after switch", async () => {
    let resolveHydrate!: (entries: InboxEntry[]) => void;
    const staleHydrate = new Promise<InboxEntry[]>((resolve) => {
      resolveHydrate = resolve;
    });

    hydrateInboxEntriesFromCache
      .mockReturnValueOnce(staleHydrate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    let resolveNextOrgFetch!: (entries: InboxEntry[]) => void;
    const nextOrgFetch = new Promise<InboxEntry[]>((resolve) => {
      resolveNextOrgFetch = resolve;
    });
    fetchInboxEntries.mockReturnValue(nextOrgFetch);

    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://one.example.com",
          email: "one@example.com",
          apiKey: "api-key",
        },
        {
          id: "instance-2",
          realm: "https://two.example.com",
          email: "two@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
    });

    await act(async () => {
      resolveHydrate([
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Old org cached inbox row",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 10,
          messageIds: [1],
        },
      ]);
      await staleHydrate;
    });

    expect(useInboxStore.getState().entries).toEqual([]);

    await act(async () => {
      resolveNextOrgFetch([
        {
          key: "dm:99",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 99,
          senderName: "Current org inbox row",
          dmSlug: "99",
          unreadCount: 2,
          lastMessageTimestamp: 20,
          messageIds: [2],
        },
      ]);
      await nextOrgFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org inbox row")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org cached inbox row")).not.toBeInTheDocument();
  });

  it("does not apply stale inbox refresh after organization switch", async () => {
    let resolveOldFetch!: (entries: InboxEntry[]) => void;
    const oldFetch = new Promise<InboxEntry[]>((resolve) => {
      resolveOldFetch = resolve;
    });

    let resolveNewFetch!: (entries: InboxEntry[]) => void;
    const newFetch = new Promise<InboxEntry[]>((resolve) => {
      resolveNewFetch = resolve;
    });

    hydrateInboxEntriesFromCache.mockResolvedValue([]);
    fetchInboxEntries.mockReturnValueOnce(oldFetch).mockReturnValueOnce(newFetch);

    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://one.example.com",
          email: "one@example.com",
          apiKey: "api-key",
        },
        {
          id: "instance-2",
          realm: "https://two.example.com",
          email: "two@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchInboxEntries).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
    });

    await waitFor(() => {
      expect(fetchInboxEntries).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveOldFetch([
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Old org inbox refresh row",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 10,
          messageIds: [1],
        },
      ]);
      await oldFetch;
    });

    expect(useInboxStore.getState().entries).toEqual([]);

    await act(async () => {
      resolveNewFetch([
        {
          key: "dm:99",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 99,
          senderName: "Current org refreshed inbox row",
          dmSlug: "99",
          unreadCount: 2,
          lastMessageTimestamp: 20,
          messageIds: [2],
        },
      ]);
      await newFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org refreshed inbox row")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org inbox refresh row")).not.toBeInTheDocument();
  });
});
