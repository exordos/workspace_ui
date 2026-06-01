import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import type * as ZulipReadStateModule from "~/shared/api/zulip-read-state";
import { renderWithProviders } from "~/test/render";
import { ChatHeader } from "./chat-header.ui";

const setTopicResolvedStateMock = vi.fn();
const renameStreamTopicMock = vi.fn();

vi.mock("~/shared/api/zulip-read-state", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipReadStateModule>();
  return {
    ...actual,
    setTopicResolvedState: (...args: unknown[]) => setTopicResolvedStateMock(...args),
    renameStreamTopic: (...args: unknown[]) => renameStreamTopicMock(...args),
  };
});

describe("ChatHeader", () => {
  afterEach(() => {
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    setTopicResolvedStateMock.mockReset();
    renameStreamTopicMock.mockReset();
  });

  it("shows typing status for DM partner when typing flag is set", () => {
    const dmPartner = {
      name: "Alice",
      avatarUrl: null,
      presenceState: "active" as const,
      isTyping: true,
    };

    renderWithProviders(
      <ChatHeader channelName="unused" dmPartner={dmPartner} hideParticipants hideTopic />,
    );

    expect(screen.getByText(/typing|печатает/i)).toBeInTheDocument();
    expect(screen.queryByText(/^typing$/)).not.toBeInTheDocument();
  });

  it("falls back to presence status when typing flag is absent", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        hideParticipants
        hideTopic
      />,
    );

    expect(screen.getByText(/online|в сети/i)).toBeInTheDocument();
  });

  it("shows deactivated label for DM partner instead of presence when account is deactivated", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{
          name: "Alice",
          avatarUrl: null,
          presenceState: "active",
          isAccountDeactivated: true,
        }}
        hideParticipants
        hideTopic
      />,
    );

    expect(screen.getByText(/deactivated|заблокирован/i)).toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
  });

  it("opens DM partner profile from avatar click", () => {
    const onDmPartnerClick = vi.fn();

    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        hideParticipants
        hideTopic
        onDmPartnerClick={onDmPartnerClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open profile: alice/i }));

    expect(onDmPartnerClick).toHaveBeenCalledTimes(1);
  });

  it("does not expose DM partner title as a button without profile handler", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        hideParticipants
        hideTopic
      />,
    );

    expect(screen.queryByRole("button", { name: /open profile: alice/i })).not.toBeInTheDocument();
  });

  it("opens DM partner profile from title action", () => {
    const onDmPartnerClick = vi.fn();

    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Slon", avatarUrl: null, presenceState: "idle" }}
        hideParticipants
        hideTopic
        onDmPartnerClick={onDmPartnerClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open profile: slon/i }));

    expect(onDmPartnerClick).toHaveBeenCalledTimes(1);
  });

  it("shows group dm title and participant count", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmGroup={{ name: "Alice, Bob, Me", participantsCount: 3 }}
        hideParticipants
        hideTopic
      />,
    );

    expect(screen.getByText("Alice, Bob, Me")).toBeInTheDocument();
    expect(screen.getByText(/3 (members?|участник|участника|участников)/i)).toBeInTheDocument();
  });

  it("uses flat shell, compact metadata typography and topbar-aligned height", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        hideParticipants
        hideTopic
      />,
    );

    const header = screen.getByText("Alice").closest("header");
    const status = screen.getByText(/online|в сети/i);

    expect(header).not.toHaveClass("rounded-xl");
    expect(header).toHaveClass("py-2");
    expect(status).toHaveClass("text-xs");
  });

  it("shows stream topic as primary heading with channel muted when topic is visible", () => {
    renderWithProviders(
      <ChatHeader
        channelName="#engineering"
        topic="sprint-planning"
        hideTopic={false}
        hideParticipants
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("sprint-planning · #engineering");
    expect(heading.querySelector(".font-semibold")).toHaveTextContent("sprint-planning");
    expect(heading.closest("button")).toBeNull();
  });

  it("does not expose channel title or right panel controls without panel handlers", () => {
    renderWithProviders(<ChatHeader channelName="general" hideTopic hideParticipants />);

    expect(
      screen.queryByRole("button", { name: /channel info|информация о канале/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /hide panel|скрыть панель/i }),
    ).not.toBeInTheDocument();
  });

  it("uses toggle handler as fallback for channel title action", () => {
    const onToggleRightPanel = vi.fn();

    renderWithProviders(
      <ChatHeader
        channelName="#engineering"
        topic="sprint-planning"
        hideTopic={false}
        hideParticipants={false}
        participantsCount={2}
        onlineCount={1}
        onToggleRightPanel={onToggleRightPanel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /channel info|информация о канале/i }));

    expect(onToggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it("opens right panel from channel title block click", () => {
    const onOpenRightPanel = vi.fn();
    const onToggleRightPanel = vi.fn();

    renderWithProviders(
      <ChatHeader
        channelName="#engineering"
        topic="sprint-planning"
        hideTopic={false}
        hideParticipants={false}
        participantsCount={2}
        onlineCount={1}
        onOpenRightPanel={onOpenRightPanel}
        onToggleRightPanel={onToggleRightPanel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /channel info|информация о канале/i }));

    expect(onOpenRightPanel).toHaveBeenCalledTimes(1);
    expect(onToggleRightPanel).not.toHaveBeenCalled();
  });

  it("places chat actions button inside right controls cluster", () => {
    renderWithProviders(
      <ChatHeader
        channelName="general"
        hideTopic
        hideParticipants
        onOpenSearch={vi.fn()}
        onToggleRightPanel={vi.fn()}
      />,
    );

    const searchButton = screen.getByRole("button", { name: /search/i });
    const actionButton = screen.getByRole("button", { name: /hide panel/i });
    const controlsCluster = searchButton.parentElement;

    expect(controlsCluster).not.toBeNull();
    expect(controlsCluster).toContainElement(actionButton);
  });

  it("marks topic as done from header topic menu", async () => {
    const user = userEvent.setup();
    setTopicResolvedStateMock.mockResolvedValue(true);
    useCurrentChatMessagesStore.setState({
      context: { type: "stream", streamId: 10, streamName: "engineering", topic: "incident" },
      messages: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "engineering" }]);
    useChatListStore.getState().setCurrentUserId(42);
    useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });

    renderWithProviders(
      <ChatHeader channelName="#engineering" topic="incident" hideTopic={false} hideParticipants />,
    );

    await user.click(screen.getByRole("button", { name: /chat menu/i }));
    await user.click(await screen.findByRole("menuitem", { name: /mark topic as done/i }));

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(10, "incident", true);
    });
  });

  it("renames topic from header topic menu", async () => {
    const user = userEvent.setup();
    renameStreamTopicMock.mockResolvedValue(true);
    useCurrentChatMessagesStore.setState({
      context: { type: "stream", streamId: 10, streamName: "engineering", topic: "incident" },
      messages: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "engineering" }]);
    useChatListStore.getState().setCurrentUserId(42);

    renderWithProviders(
      <ChatHeader channelName="#engineering" topic="incident" hideTopic={false} hideParticipants />,
    );

    await user.click(screen.getByRole("button", { name: /chat menu/i }));
    await user.click(await screen.findByRole("menuitem", { name: /rename topic/i }));

    const input = await screen.findByRole("textbox", { name: /topic name/i });
    await user.clear(input);
    await user.type(input, "postmortem");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(renameStreamTopicMock).toHaveBeenCalledWith(10, "incident", "postmortem");
    });
  });

  it("hides topic resolve menu on stream-wide view", () => {
    useCurrentChatMessagesStore.setState({
      context: {
        type: "stream",
        streamId: 10,
        streamName: "engineering",
        topic: "general",
        streamWideView: true,
      },
      messages: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "engineering" }]);
    useChatListStore.getState().setCurrentUserId(42);
    useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });

    renderWithProviders(
      <ChatHeader channelName="#engineering" topic="general" hideTopic={false} hideParticipants />,
    );

    expect(screen.queryByRole("button", { name: /chat menu/i })).not.toBeInTheDocument();
  });
});
