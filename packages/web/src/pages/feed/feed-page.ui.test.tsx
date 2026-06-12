import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFeedStore } from "~/entities/feed/feed.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { FeedPage } from "./feed-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchFeedMessages = vi.hoisted(() => vi.fn());
const hydrateFeedMessagesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/feed/feed.api", async () => {
  const actual = await vi.importActual<typeof import("~/entities/feed/feed.api")>(
    "~/entities/feed/feed.api",
  );
  return {
    ...actual,
    fetchFeedMessages,
    hydrateFeedMessagesFromCache,
  };
});

const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

function mockElementScrollHeight(value: number): () => void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return value;
    },
  });

  return () => {
    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeightDescriptor);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  };
}

function mockElementScrollTo(
  impl: (this: HTMLElement, options: ScrollToOptions) => void,
): () => void {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: impl,
  });

  return () => {
    if (scrollToDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  };
}

describe("FeedPage forward action", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchFeedMessages.mockReset();
    hydrateFeedMessagesFromCache.mockReset();
    hydrateFeedMessagesFromCache.mockResolvedValue([]);
    useFeedStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  it("opens chat forward flow from feed message action", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    const message = createMessage({
      id: 55,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Forward from feed",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
      channel: "engineering",
    });

    fetchFeedMessages.mockResolvedValue({
      messages: [message],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Forward from feed")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=55&forward=55");
  });

  it("opens explicit empty-topic forward flow when feed message topic is empty", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    const message = createMessage({
      id: 57,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "",
      content: "Forward from feed without topic",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
      channel: "engineering",
    });

    fetchFeedMessages.mockResolvedValue({
      messages: [message],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Forward from feed without topic")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(navigateSpy).toHaveBeenCalledWith(
      "/stream/10-engineering/topic/__empty__?msg=57&forward=57",
    );
  });

  it("loads feed after active instance becomes available", async () => {
    const message = createMessage({
      id: 56,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Deferred feed load",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
      channel: "engineering",
    });

    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
    fetchFeedMessages.mockResolvedValue({
      messages: [message],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(fetchFeedMessages).not.toHaveBeenCalled();

    act(() => {
      useInstancesStore.setState({
        instances: [
          {
            id: "instance-1",
            realm: "https://zulip.example.com",
            email: "user@example.com",
            apiKey: "api-key",
          },
        ],
        currentInstanceId: "instance-1",
        unreadCountsByInstance: {},
      });
    });

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(
        "newest",
        50,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Deferred feed load")).toBeInTheDocument();
    });
  });

  it("uses card-style feed row classes for themed readability", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    const message = createMessage({
      id: 58,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "style",
      content: "Feed style contract",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
      channel: "engineering",
    });

    fetchFeedMessages.mockResolvedValue({
      messages: [message],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Feed style contract")).toBeInTheDocument();
    });

    const row = screen.getByText("Feed style contract").closest("div");
    expect(row).toHaveClass("rounded-xl");
    expect(row).toHaveClass("border");
    expect(row).toHaveClass("border-border-subtle");
    expect(row).toHaveClass("bg-bg-elevated/60");
  });

  it("renders cached feed immediately while newest refresh is in flight", () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    useFeedStore.setState({
      instanceId: "instance-1",
      messages: [
        createMessage({
          id: 99,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "cache",
          content: "Cached feed item",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
          channel: "engineering",
        }) as MockMessage,
      ],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      isAllLoaded: false,
      lastMessageId: 99,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });

    fetchFeedMessages.mockResolvedValue({
      messages: [
        createMessage({
          id: 99,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "cache",
          content: "Cached feed item",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
          channel: "engineering",
        }),
      ],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Cached feed item")).toBeInTheDocument();
  });

  it("initializes the feed list at the latest messages", async () => {
    const restoreScrollHeight = mockElementScrollHeight(1200);
    const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      Object.defineProperty(this, "scrollTop", {
        configurable: true,
        writable: true,
        value: options.top ?? 0,
      });
    });
    const restoreScrollTo = mockElementScrollTo(scrollTo);
    try {
      useInstancesStore.setState({
        instances: [
          {
            id: "instance-1",
            realm: "https://zulip.example.com",
            email: "user@example.com",
            apiKey: "api-key",
          },
        ],
        currentInstanceId: "instance-1",
        unreadCountsByInstance: {},
      });

      fetchFeedMessages.mockResolvedValue({
        messages: [
          createMessage({
            id: 60,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "scroll",
            content: "Feed first item",
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
            channel: "engineering",
          }),
          createMessage({
            id: 61,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "scroll",
            content: "Feed latest item",
            timestamp: 2,
            type: "stream",
            display_recipient: "engineering",
            channel: "engineering",
          }),
        ],
        foundOldest: true,
      });

      const { container } = render(
        <MemoryRouter initialEntries={["/feed"]}>
          <Routes>
            <Route path="/feed" element={<FeedPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Feed latest item")).toBeInTheDocument();
      });

      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      expect((list as HTMLUListElement).scrollTop).toBe(1200);
      expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "instant" });
    } finally {
      restoreScrollTo();
      restoreScrollHeight();
    }
  });

  it("shows scroll-to-bottom button when feed list is away from bottom and scrolls down on click", async () => {
    const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      Object.defineProperty(this, "scrollTop", {
        configurable: true,
        writable: true,
        value: options.top ?? 0,
      });
    });
    const restoreScrollTo = mockElementScrollTo(scrollTo);
    try {
      useInstancesStore.setState({
        instances: [
          {
            id: "instance-1",
            realm: "https://zulip.example.com",
            email: "user@example.com",
            apiKey: "api-key",
          },
        ],
        currentInstanceId: "instance-1",
        unreadCountsByInstance: {},
      });

      const message = createMessage({
        id: 59,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "scroll",
        content: "Scroll button target",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
        channel: "engineering",
      });

      fetchFeedMessages.mockResolvedValue({
        messages: [message],
        foundOldest: true,
      });

      const { container } = render(
        <MemoryRouter initialEntries={["/feed"]}>
          <Routes>
            <Route path="/feed" element={<FeedPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Scroll button target")).toBeInTheDocument();
      });

      const list = container.querySelector("ul") as HTMLUListElement;
      Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1200 });
      Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 120 });

      fireEvent.scroll(list);

      const scrollButton = screen.getByRole("button", { name: /scroll to bottom/i });
      expect(scrollButton).toBeInTheDocument();

      fireEvent.click(scrollButton);
      expect(list.scrollTop).toBe(1200);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: "smooth" });
    } finally {
      restoreScrollTo();
    }
  });

  it("does not apply cached feed from the previous organization after switch", async () => {
    let resolveHydrate!: (messages: MockMessage[]) => void;
    const staleHydrate = new Promise<MockMessage[]>((resolve) => {
      resolveHydrate = resolve;
    });

    hydrateFeedMessagesFromCache
      .mockReturnValueOnce(staleHydrate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    let resolveNextOrgFetch!: (value: {
      messages: MockMessage[];
      foundOldest: boolean;
    }) => void;
    const nextOrgFetch = new Promise<{ messages: MockMessage[]; foundOldest: boolean }>(
      (resolve) => {
        resolveNextOrgFetch = resolve;
      },
    );
    fetchFeedMessages.mockReturnValue(nextOrgFetch);

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
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
    });

    await act(async () => {
      resolveHydrate([
        createMessage({
          id: 500,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "cache",
          content: "Old org cached feed item",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
          channel: "engineering",
        }) as MockMessage,
      ]);
      await staleHydrate;
    });

    expect(useFeedStore.getState().messages).toEqual([]);

    await act(async () => {
      resolveNextOrgFetch({
        messages: [
          createMessage({
            id: 600,
            sender_id: 99,
            sender_full_name: "Bob",
            stream_id: 20,
            subject: "fresh",
            content: "Current org feed item",
            timestamp: 2,
            type: "stream",
            display_recipient: "support",
            channel: "support",
          }) as MockMessage,
        ],
        foundOldest: true,
      });
      await nextOrgFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org feed item")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org cached feed item")).not.toBeInTheDocument();
  });

  it("does not apply stale newest feed refresh after organization switch", async () => {
    let resolveOldFetch!: (value: { messages: MockMessage[]; foundOldest: boolean }) => void;
    const oldFetch = new Promise<{ messages: MockMessage[]; foundOldest: boolean }>((resolve) => {
      resolveOldFetch = resolve;
    });

    let resolveNewFetch!: (value: { messages: MockMessage[]; foundOldest: boolean }) => void;
    const newFetch = new Promise<{ messages: MockMessage[]; foundOldest: boolean }>((resolve) => {
      resolveNewFetch = resolve;
    });

    hydrateFeedMessagesFromCache.mockResolvedValue([]);
    fetchFeedMessages.mockReturnValueOnce(oldFetch).mockReturnValueOnce(newFetch);

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
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
    });

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveOldFetch({
        messages: [
          createMessage({
            id: 700,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "old",
            content: "Old org newest feed item",
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
            channel: "engineering",
          }) as MockMessage,
        ],
        foundOldest: true,
      });
      await oldFetch;
    });

    expect(useFeedStore.getState().messages).toEqual([]);

    await act(async () => {
      resolveNewFetch({
        messages: [
          createMessage({
            id: 800,
            sender_id: 99,
            sender_full_name: "Bob",
            stream_id: 20,
            subject: "new",
            content: "Current org newest feed item",
            timestamp: 2,
            type: "stream",
            display_recipient: "support",
            channel: "support",
          }) as MockMessage,
        ],
        foundOldest: true,
      });
      await newFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org newest feed item")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org newest feed item")).not.toBeInTheDocument();
  });

  it("does not append stale older feed page after organization switch", async () => {
    let resolveOlderPage!: (value: { messages: MockMessage[]; foundOldest: boolean }) => void;
    const olderPage = new Promise<{ messages: MockMessage[]; foundOldest: boolean }>((resolve) => {
      resolveOlderPage = resolve;
    });

    hydrateFeedMessagesFromCache.mockReturnValue(new Promise(() => {}));
    fetchFeedMessages.mockReturnValue(olderPage);

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

    useFeedStore.setState({
      instanceId: "instance-1",
      messages: [
        createMessage({
          id: 100,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "base",
          content: "Base feed item",
          timestamp: 10,
          type: "stream",
          display_recipient: "engineering",
          channel: "engineering",
        }) as MockMessage,
      ],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      isAllLoaded: false,
      lastMessageId: 100,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Base feed item")).toBeInTheDocument();
    });

    const list = container.querySelector("ul") as HTMLUListElement;
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });

    fireEvent.scroll(list);

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(100, 50);
    });

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
    });

    await act(async () => {
      resolveOlderPage({
        messages: [
          createMessage({
            id: 90,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "old",
            content: "Old org older page item",
            timestamp: 5,
            type: "stream",
            display_recipient: "engineering",
            channel: "engineering",
          }) as MockMessage,
          createMessage({
            id: 100,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "base",
            content: "Base feed item",
            timestamp: 10,
            type: "stream",
            display_recipient: "engineering",
            channel: "engineering",
          }) as MockMessage,
        ],
        foundOldest: true,
      });
      await olderPage;
    });

    expect(useFeedStore.getState().messages).toEqual([]);
  });
});
