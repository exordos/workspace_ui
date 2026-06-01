import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { InboxPage } from "./inbox-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchInboxEntries = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const hydrateInboxEntriesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));

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
    });
  });

  afterEach(() => {
    navigateSpy.mockReset();
    fetchInboxEntries.mockReset();
    hydrateInboxEntriesFromCache.mockReset();
    fetchInboxEntries.mockResolvedValue([]);
    hydrateInboxEntriesFromCache.mockResolvedValue([]);
    useInboxStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
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
      stale: false,
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
      stale: false,
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
      stale: false,
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
});
