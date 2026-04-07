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
  };
});

describe("FeedPage forward action", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchFeedMessages.mockReset();
    useFeedStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
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

  it("opens stream root forward flow when feed message topic is empty", async () => {
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

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering?msg=57&forward=57");
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
      expect(fetchFeedMessages).toHaveBeenCalledWith("newest", 50);
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

  it("shows scroll-to-bottom button when feed list is away from bottom and scrolls down on click", async () => {
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
  });
});
