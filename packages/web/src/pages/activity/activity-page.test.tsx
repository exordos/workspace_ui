import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { createMessage } from "~/test/factories";
import { ActivityPage } from "./activity-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchDrafts = vi.hoisted(() => vi.fn());
const deleteDraftOnServer = vi.hoisted(() => vi.fn());
const updateDraftOnServer = vi.hoisted(() => vi.fn());
const fetchActivityMessages = vi.hoisted(() => vi.fn());
const fetchActivityMessagesPage = vi.hoisted(() => vi.fn());
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
    fetchDrafts,
    deleteDraftOnServer,
    updateDraftOnServer,
  };
});

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/zulip-messages")>(
    "~/shared/api/zulip-messages",
  );
  return {
    ...actual,
    fetchActivityMessages,
    fetchActivityMessagesPage,
    removeMessageFlag,
  };
});

describe("ActivityPage drafts routing", () => {
  beforeEach(() => {
    useActivityStore.setState({ staleVersion: 0 });
  });

  afterEach(() => {
    navigateSpy.mockReset();
    fetchDrafts.mockReset();
    deleteDraftOnServer.mockReset();
    updateDraftOnServer.mockReset();
    fetchActivityMessages.mockReset();
    fetchActivityMessagesPage.mockReset();
    removeMessageFlag.mockReset();
    useDraftStore.getState().clear();
    useChatListStore.getState().clear();
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

    fetchDrafts.mockResolvedValue([
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
    });

    fireEvent.click(screen.getByText("Draft content"));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/general");
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

    fetchActivityMessagesPage.mockResolvedValue({
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

    fetchActivityMessagesPage.mockResolvedValue({
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

    fetchActivityMessagesPage.mockResolvedValue({
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

    fetchActivityMessagesPage.mockResolvedValue({
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

  it("renders load-more control for starred when older history exists", async () => {
    const page = Array.from({ length: 5 }, (_, index) =>
      createMessage({
        id: index + 100,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: `Starred ${index + 1}`,
        timestamp: index + 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    );

    fetchActivityMessagesPage.mockResolvedValue({
      messages: page,
      foundOldest: false,
    });

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred 1")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("hides the load-more control when the server reports foundOldest for activity messages", async () => {
    const page = Array.from({ length: 5 }, (_, index) =>
      createMessage({
        id: index + 1,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: `Message ${index + 1}`,
        timestamp: index + 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    );

    fetchActivityMessages.mockResolvedValue(page);
    fetchActivityMessagesPage.mockResolvedValue({
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
      expect(screen.getByText("Message 1")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("renders localized load-more control when more activity history exists", async () => {
    const page = Array.from({ length: 5 }, (_, index) =>
      createMessage({
        id: index + 1,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: `Message ${index + 1}`,
        timestamp: index + 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    );

    fetchActivityMessages.mockResolvedValue(page);
    fetchActivityMessagesPage.mockResolvedValue({
      messages: page,
      foundOldest: false,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Message 1")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
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
    fetchDrafts.mockResolvedValue([
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
    fetchDrafts.mockResolvedValue([
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
    fetchDrafts.mockResolvedValue([
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
    fetchDrafts.mockResolvedValue([
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
    fetchActivityMessagesPage
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

    expect(fetchActivityMessagesPage).toHaveBeenCalledTimes(2);
  });
});
