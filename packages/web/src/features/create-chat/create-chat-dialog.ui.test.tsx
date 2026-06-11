import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "./create-chat-dialog.ui";
import { createChannel, unarchiveChannel } from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
  unarchiveChannel: vi.fn(),
  subscribeCurrentUserToStream: vi.fn(),
  unsubscribeChannel: vi.fn(),
}));

vi.mock("~/shared/api/zulip-streams", () => ({
  fetchStreams: vi.fn(),
  fetchSubscriptions: vi.fn(),
}));

import { fetchStreams, fetchSubscriptions } from "~/shared/api/zulip-streams";

describe("CreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useUsersStore.getState().mergeUsers([{ user_id: 1, full_name: "Alice", email: "a@a.test" }]);
    vi.mocked(fetchStreams).mockResolvedValue([]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([]);
  });

  afterEach(() => {
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
  });

  it("disables channel creation and shows reason while current profile is loading", () => {
    useChatListStore.setState({ currentUserId: null });

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Create channel" }));
    fireEvent.change(screen.getByPlaceholderText("Channel name"), {
      target: { value: "engineering" },
    });

    // Assert: UI explicitly blocks creation until author profile loads.
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(
      screen.getByText("Profile is still loading. Try again in a moment."),
    ).toBeInTheDocument();

    fireEvent.click(createButton);
    expect(createChannel).not.toHaveBeenCalled();
  });

  it("renders channels tab with subscribe action in the detail panel", async () => {
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_id: 42,
        name: "engineering",
        description: "Team channel",
        is_announcement_only: false,
        subscriber_count: 15,
        stream_weekly_traffic: 30,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([]);

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Channels" }));

    expect(await screen.findByText("Team channel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "#engineering" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    expect(screen.getByLabelText("15 subscribers")).toBeInTheDocument();
    expect(screen.getByLabelText("30 messages per week")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("shows unsubscribe and channel settings for subscribed channels", async () => {
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_id: 42,
        name: "engineering",
        description: "Team channel",
        is_announcement_only: false,
        invite_only: true,
        history_public_to_subscribers: true,
        subscriber_count: 8,
        stream_weekly_traffic: 12,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([
      { stream_id: 42, name: "engineering", is_muted: false, invite_only: true },
    ]);

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Channels" }));
    fireEvent.click(screen.getByRole("button", { name: "Subscribed" }));

    expect(await screen.findByText("Closed, open history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open channel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Show channels" })).toBeInTheDocument();
  });

  it("renders archived channels tab and linked tabpanel", () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    const archivedTab = screen.getByRole("tab", { name: "Archived channels" });
    fireEvent.click(archivedTab);

    const archivedPanelId = archivedTab.getAttribute("aria-controls");
    expect(archivedPanelId).toBeTruthy();
    const archivedPanel = document.getElementById(archivedPanelId!);
    expect(archivedPanel).toBeInTheDocument();
    expect(archivedPanel).toHaveAttribute("role", "tabpanel");
    expect(archivedPanel).toHaveAttribute("aria-labelledby", archivedTab.id);
  });

  it("supports keyboard navigation to archived tab with End and back to start with Home", () => {
    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    const startChatTab = screen.getByRole("tab", { name: "Start chat" });
    const archivedTab = screen.getByRole("tab", { name: "Archived channels" });

    startChatTab.focus();
    fireEvent.keyDown(startChatTab, { key: "End" });
    expect(archivedTab).toHaveFocus();
    expect(archivedTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(archivedTab, { key: "Home" });
    expect(startChatTab).toHaveFocus();
    expect(startChatTab).toHaveAttribute("aria-selected", "true");
  });

  it("filters archived channels by search and renders unarchive action", () => {
    useChatListStore.getState().upsertStreamMetadataRows([
      { streamId: 77, name: "engineering", isArchived: true },
      { streamId: 78, name: "design", isArchived: true },
    ]);

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    fireEvent.change(screen.getByPlaceholderText("Search archived channels…"), {
      target: { value: "engine" },
    });

    expect(screen.getByText("#engineering")).toBeInTheDocument();
    expect(screen.queryByText("#design")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unarchive: engineering/i })).toBeInTheDocument();
  });

  it("открывает архивный канал по клику на строку и вызывает onNavigateStream", () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);
    const onNavigateStream = vi.fn();

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={onNavigateStream}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    const title = screen.getByText("#engineering");
    fireEvent.click(title.closest("button")!);

    expect(onNavigateStream).toHaveBeenCalledWith(77, "engineering");
  });

  it("кнопка разархивирования дергаёт API и не вызывает onNavigateStream", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);
    vi.mocked(unarchiveChannel).mockResolvedValue({ ok: true });
    const onNavigateStream = vi.fn();

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={onNavigateStream}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    fireEvent.click(screen.getByRole("button", { name: /Unarchive: engineering/i }));

    await waitFor(() => {
      expect(unarchiveChannel).toHaveBeenCalledWith(77);
    });
    expect(onNavigateStream).not.toHaveBeenCalled();
  });

  it("убирает канал со вкладки после успеха и обновления isArchived в store", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);
    vi.mocked(unarchiveChannel).mockResolvedValue({ ok: true });

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    fireEvent.click(screen.getByRole("button", { name: /Unarchive: engineering/i }));

    await waitFor(() => {
      expect(unarchiveChannel).toHaveBeenCalled();
    });

    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: false }]);

    await waitFor(() => {
      expect(screen.queryByText("#engineering")).not.toBeInTheDocument();
    });
  });

  it("рендерит inline-ошибку при неудачном unarchive", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);
    vi.mocked(unarchiveChannel).mockResolvedValue({
      ok: false,
      kind: "transient",
      message: "Rate limited",
      status: 429,
    });

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    fireEvent.click(screen.getByRole("button", { name: /Unarchive: engineering/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Rate limited");
    });
  });

  it("блокирует кнопку unarchive пока запрос выполняется", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 77, name: "engineering", isArchived: true }]);
    let release!: () => void;
    const deferred = new Promise<{ ok: true }>((resolve) => {
      release = () => resolve({ ok: true });
    });
    vi.mocked(unarchiveChannel).mockReturnValue(deferred);

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onNavigateStream={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    const btn = screen.getByRole("button", { name: /Unarchive: engineering/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-busy", "true");
      expect(btn).toBeDisabled();
    });

    release();
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
  });
});
