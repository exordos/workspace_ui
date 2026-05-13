import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "./create-chat-dialog.ui";
import { createChannel, unarchiveChannel } from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
  unarchiveChannel: vi.fn(),
}));

describe("CreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useUsersStore.getState().mergeUsers([{ user_id: 1, full_name: "Alice", email: "a@a.test" }]);
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

    // Что проверяет: UI явно блокирует создание до загрузки профиля автора.
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(
      screen.getByText("Profile is still loading. Try again in a moment."),
    ).toBeInTheDocument();

    fireEvent.click(createButton);
    expect(createChannel).not.toHaveBeenCalled();
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
