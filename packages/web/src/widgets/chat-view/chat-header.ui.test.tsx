import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { ChatHeader } from "./chat-header.ui";

describe("ChatHeader", () => {
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

  it("renders emoji-only realm custom status for DM partner", () => {
    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{
          name: "Alice",
          avatarUrl: null,
          presenceState: "active",
          customStatus: ":scam:",
        }}
        hideParticipants
        hideTopic
      />,
    );

    expect(screen.getByText(":scam:")).toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
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

  it("opens right panel from DM name block click", () => {
    const onOpenRightPanel = vi.fn();
    const onDmPartnerClick = vi.fn();

    renderWithProviders(
      <ChatHeader
        channelName="unused"
        dmPartner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        hideParticipants
        hideTopic
        onOpenRightPanel={onOpenRightPanel}
        onDmPartnerClick={onDmPartnerClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /partner info|информация о собеседнике/i }));

    expect(onOpenRightPanel).toHaveBeenCalledTimes(1);
    expect(onDmPartnerClick).not.toHaveBeenCalled();
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

  it("uses rounded top shell, compact metadata typography and topbar-aligned height", () => {
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

    expect(header).toHaveClass("rounded-xl");
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

  it("renders the system general-chat topic in italic", () => {
    renderWithProviders(
      <ChatHeader
        channelName="#engineering"
        topic="General Chat"
        systemTopic
        hideTopic={false}
        hideParticipants
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("General Chat · #engineering");
    expect(heading.querySelector(".font-semibold")).toHaveClass("italic");
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
});
