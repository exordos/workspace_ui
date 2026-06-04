import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { createMessage, createUser } from "~/test/factories";
import { ActivityPage } from "./activity-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const deleteDraftOnServer = vi.hoisted(() => vi.fn());
const updateDraftOnServer = vi.hoisted(() => vi.fn());
const fetchActivityMessagesPageWithPersist = vi.hoisted(() => vi.fn());
const hydrateActivityMessagesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const removeMessageFlag = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/draft/draft.api", async () => {
  const actual = await vi.importActual<typeof import("~/entities/draft/draft.api")>(
    "~/entities/draft/draft.api",
  );
  return {
    ...actual,
    deleteDraftOnServer,
    updateDraftOnServer,
  };
});

vi.mock("~/entities/activity/activity.api", () => ({
  fetchActivityMessagesPageWithPersist,
}));

vi.mock("~/entities/activity/activity-cache.lib", async () => {
  const actual = await vi.importActual<typeof import("~/entities/activity/activity-cache.lib")>(
    "~/entities/activity/activity-cache.lib",
  );
  return {
    ...actual,
    hydrateActivityMessagesFromCache,
  };
});

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/zulip-messages")>(
    "~/shared/api/zulip-messages",
  );
  return {
    ...actual,
    removeMessageFlag,
  };
});

const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);

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

describe("ActivityPage drafts routing", () => {
  beforeEach(() => {
    useActivityStore.getState().clear();
  });

  afterEach(() => {
    navigateSpy.mockReset();
    deleteDraftOnServer.mockReset();
    updateDraftOnServer.mockReset();
    fetchActivityMessagesPageWithPersist.mockReset();
    hydrateActivityMessagesFromCache.mockReset();
    hydrateActivityMessagesFromCache.mockResolvedValue([]);
    removeMessageFlag.mockReset();
    useDraftStore.getState().clear();
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useActivityStore.getState().clear();
  });

  it("navigates stream drafts using the canonical stream slug from the store", async () => {
    useChatListStore.setState({
      streamsMap: new Map([
        [
          10,
          {
            stream_id: 10,
            name: "engineering",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
    });

    useDraftStore.getState().setDrafts([
      {
        id: 1,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Draft content",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Draft content")).toBeInTheDocument();
      expect(screen.getByText("#engineering · general")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Draft content"));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/general");
  });

  it("shows DM partner name on private draft rows", async () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 7, full_name: "Bob" }));
    useChatListStore.setState({ currentUserId: 42 });

    useDraftStore.getState().setDrafts([
      {
        id: 2,
        type: "private",
        to: [7, 42],
        topic: "",
        content: "DM draft text",
        timestamp: 1710000001,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("DM draft text")).toBeInTheDocument();
      expect(screen.getByText(/Bob/)).toBeInTheDocument();
    });
  });

  it("opens activity message in chat from context action", async () => {
    const page = [
      createMessage({
        id: 33,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Open me",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Open me")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open in chat" }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=33");
  });

  it("opens forward flow from activity message action", async () => {
    const page = [
      createMessage({
        id: 44,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Forward me",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Forward me")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=44&forward=44");
  });

  it("renders cached activity list immediately while newest refresh is in flight", () => {
    const cachedMention = createMessage({
      id: 88,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Cached mention",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    useActivityStore.getState().setFilterCache("mentions", [cachedMention], true);
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [cachedMention],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Cached mention")).toBeInTheDocument();
  });

  it("keeps current in-memory activity snapshot when cached snapshot is older", async () => {
    const freshReaction = createMessage({
      id: 30,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Fresh reaction",
      timestamp: 300,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    const oldReaction = createMessage({
      id: 10,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Old reaction",
      timestamp: 100,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;

    useChatListStore.setState({ currentUserId: 42 });
    useActivityStore.getState().setFilterCache("reactions", [freshReaction], true);
    useActivityStore.setState((state) => ({
      filters: {
        ...state.filters,
        reactions: { ...state.filters.reactions, lastLoadedAt: null },
      },
    }));
    hydrateActivityMessagesFromCache.mockResolvedValue([oldReaction]);
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [freshReaction],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalled();
    });

    expect(screen.getByText("Fresh reaction")).toBeInTheDocument();
    expect(screen.queryByText("Old reaction")).not.toBeInTheDocument();
  });

  it("applies cached activity snapshot when it is fresher than in-memory state", async () => {
    const oldReaction = createMessage({
      id: 10,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Old reaction",
      timestamp: 100,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    const freshReaction = createMessage({
      id: 30,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Fresh reaction",
      timestamp: 300,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;

    useChatListStore.setState({ currentUserId: 42 });
    useActivityStore.getState().setFilterCache("reactions", [oldReaction], true);
    useActivityStore.setState((state) => ({
      filters: {
        ...state.filters,
        reactions: { ...state.filters.reactions, lastLoadedAt: null },
      },
    }));
    hydrateActivityMessagesFromCache.mockResolvedValue([freshReaction]);
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [freshReaction],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Fresh reaction")).toBeInTheDocument();
    });

    expect(screen.queryByText("Old reaction")).not.toBeInTheDocument();
  });

  it("removes starred message from list after unstar action", async () => {
    const page = [
      createMessage({
        id: 55,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Starred message",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });
    removeMessageFlag.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred message")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /unstar/i }));

    await waitFor(() => {
      expect(removeMessageFlag).toHaveBeenCalledWith([55], "starred");
    });
    expect(screen.queryByText("Starred message")).not.toBeInTheDocument();
  });

  it("keeps starred message when unstar request fails", async () => {
    const page = [
      createMessage({
        id: 56,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Starred message persists",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });
    removeMessageFlag.mockRejectedValue(new Error("network"));

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred message persists")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /unstar/i }));

    await waitFor(() => {
      expect(removeMessageFlag).toHaveBeenCalledWith([56], "starred");
    });
    expect(screen.getByText("Starred message persists")).toBeInTheDocument();
  });

  it("does not fetch reactions until currentUserId is known", async () => {
    useChatListStore.setState({ currentUserId: null });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(fetchActivityMessagesPageWithPersist).not.toHaveBeenCalled();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [
        createMessage({
          id: 50,
          sender_id: 42,
          content: "My reacted message",
          timestamp: 2,
        }),
      ],
      foundOldest: true,
    });

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
    });

    await waitFor(() => {
      expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledWith(
        "reactions",
        42,
        "newest",
        expect.any(Number),
      );
    });
  });

  it("shows reactions-specific empty state copy", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Your messages that received emoji reactions will appear here/i),
      ).toBeInTheDocument();
    });
  });

  it("shows peer emoji reactions on the reactions activity list", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 7, full_name: "Bob" }),
        createUser({ user_id: 42, full_name: "Me" }),
      ]);
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: [
        createMessage({
          id: 50,
          sender_id: 42,
          content: "My reacted message",
          timestamp: 2,
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 42,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 7,
            },
          ],
        }),
      ],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("My reacted message")).toBeInTheDocument();
    });

    const reactionsRow = screen.getByTestId("activity-peer-reactions-50");
    expect(reactionsRow).toHaveTextContent("Bob");
    expect(reactionsRow).toHaveTextContent("👍");
    expect(reactionsRow).not.toHaveTextContent("Me");
  });

  it.each(["mentions", "reactions", "starred"] as const)(
    "initializes %s list at the latest messages",
    async (filter) => {
      const restoreScrollHeight = mockElementScrollHeight(1200);
      try {
        if (filter === "reactions") {
          useChatListStore.setState({ currentUserId: 42 });
        }
        const page = [
          createMessage({
            id: 10,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: `${filter} first`,
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
          }),
          createMessage({
            id: 20,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: `${filter} latest`,
            timestamp: 2,
            type: "stream",
            display_recipient: "engineering",
          }),
        ];

        fetchActivityMessagesPageWithPersist.mockResolvedValue({
          messages: page,
          foundOldest: true,
        });

        const { container } = render(
          <MemoryRouter initialEntries={[`/activity/${filter}`]}>
            <Routes>
              <Route path="/activity/:filter" element={<ActivityPage />} />
            </Routes>
          </MemoryRouter>,
        );

        await waitFor(() => {
          expect(screen.getByText(`${filter} latest`)).toBeInTheDocument();
        });

        const list = container.querySelector("ul");
        expect(list).not.toBeNull();
        expect((list as HTMLUListElement).scrollTop).toBe(1200);
      } finally {
        restoreScrollHeight();
      }
    },
  );

  it("initializes drafts list at the latest items", async () => {
    const restoreScrollHeight = mockElementScrollHeight(1200);
    try {
      useDraftStore.getState().setDrafts([
        {
          id: 1,
          type: "stream",
          to: [10],
          topic: "general",
          content: "Older draft",
          timestamp: 1710000000,
        },
        {
          id: 2,
          type: "stream",
          to: [10],
          topic: "general",
          content: "Latest draft",
          timestamp: 1710000100,
        },
      ]);

      const { container } = render(
        <MemoryRouter initialEntries={["/activity/drafts"]}>
          <Routes>
            <Route path="/activity/:filter" element={<ActivityPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Latest draft")).toBeInTheDocument();
      });

      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      expect((list as HTMLUListElement).scrollTop).toBe(1200);
    } finally {
      restoreScrollHeight();
    }
  });

  it("keeps a draft row visible while server deletion is pending", async () => {
    let resolveDelete: (value: boolean) => void = () => {
      throw new Error("Expected delete resolver to be assigned");
    };
    deleteDraftOnServer.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    useDraftStore.getState().setDrafts([
      {
        id: 7,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Pending delete draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Pending delete draft")).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle("Delete draft");
    fireEvent.click(deleteButton);

    expect(deleteDraftOnServer).toHaveBeenCalledWith(7);
    expect(screen.getByText("Pending delete draft")).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();

    resolveDelete(true);

    await waitFor(() => {
      expect(screen.queryByText("Pending delete draft")).not.toBeInTheDocument();
    });
  });

  it("keeps a draft row when server deletion returns false", async () => {
    deleteDraftOnServer.mockResolvedValue(false);
    useDraftStore.getState().setDrafts([
      {
        id: 11,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Failed delete draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed delete draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Delete draft"));

    await waitFor(() => {
      expect(deleteDraftOnServer).toHaveBeenCalledWith(11);
    });

    expect(screen.getByText("Failed delete draft")).toBeInTheDocument();
  });

  it("edits a server-backed draft from the drafts list", async () => {
    updateDraftOnServer.mockResolvedValue(true);
    useDraftStore.getState().setDrafts([
      {
        id: 8,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Editable draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Editable draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit draft"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited draft content" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateDraftOnServer).toHaveBeenCalledWith(8, {
        type: "stream",
        to: [10],
        topic: "general",
        content: "Edited draft content",
      });
    });

    expect(screen.getByText("Edited draft content")).toBeInTheDocument();
  });

  it("treats empty edited draft content as delete", async () => {
    deleteDraftOnServer.mockResolvedValue(true);
    useDraftStore.getState().setDrafts([
      {
        id: 12,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Delete from edit draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Delete from edit draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit draft"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(deleteDraftOnServer).toHaveBeenCalledWith(12);
    });

    expect(screen.queryByText("Delete from edit draft")).not.toBeInTheDocument();
  });

  it("refetches activity messages when the page is marked stale", async () => {
    fetchActivityMessagesPageWithPersist
      .mockResolvedValueOnce({
        messages: [
          createMessage({
            id: 1,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: "Initial mention",
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
          }),
        ],
        foundOldest: true,
      })
      .mockResolvedValueOnce({
        messages: [
          createMessage({
            id: 2,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: "Updated mention",
            timestamp: 2,
            type: "stream",
            display_recipient: "engineering",
          }),
        ],
        foundOldest: true,
      });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Initial mention")).toBeInTheDocument();
    });

    act(() => {
      useActivityStore.getState().markStale();
    });

    await waitFor(() => {
      expect(screen.getByText("Updated mention")).toBeInTheDocument();
    });

    expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledTimes(2);
  });
});
