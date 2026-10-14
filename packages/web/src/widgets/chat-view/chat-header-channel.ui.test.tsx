import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { ChatChannelHeader } from "./chat-header-channel.ui";

describe("ChatChannelHeader", () => {
  it("shows encrypted chat information on the protected label without a separate header action", async () => {
    const togglePanel = vi.fn();
    renderWithProviders(
      <ChatChannelHeader channelName="#engineering" encrypted onToggleRightPanel={togglePanel} />,
    );
    const information = screen.getByRole("button", { name: t("e2ee.chatFeatures") });
    expect(information.closest("h1")).not.toBeNull();
    expect(information).toHaveTextContent(t("e2ee.protectedChat"));
    expect(information.querySelector("svg")).toHaveAttribute("width", "14");
    expect(information).toHaveClass("bg-transparent", "p-0");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(information);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(t("e2ee.chatFeaturesMessages"));
    expect(tooltip).toHaveTextContent(t("e2ee.chatFeaturesMedia"));
    expect(tooltip).toHaveTextContent(t("e2ee.chatFeaturesKeys"));
    expect(tooltip).toHaveTextContent(t("e2ee.chatFeaturesMissingKey"));
    expect(tooltip).toHaveTextContent(t("e2ee.chatFeaturesMediaAccess"));
    expect(within(tooltip).getAllByRole("listitem")).toHaveLength(5);
    expect(information).toHaveAttribute("aria-describedby", tooltip.id);
    fireEvent.keyDown(information, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(information);
    expect(togglePanel).not.toHaveBeenCalled();
  });

  it("keeps the encryption information action absent from ordinary chats", () => {
    renderWithProviders(<ChatChannelHeader channelName="#engineering" />);
    expect(screen.queryByRole("button", { name: t("e2ee.chatFeatures") })).not.toBeInTheDocument();
  });

  it("shows stream topic as primary heading with channel muted when topic is visible", () => {
    renderWithProviders(
      <ChatChannelHeader
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

  it("places the protected-chat label after the channel name in the heading", () => {
    renderWithProviders(
      <ChatChannelHeader
        channelName="#engineering"
        topic="sprint-planning"
        encrypted
        hideTopic={false}
        hideParticipants
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    const protectedLabel = screen.getByText(/protected chat|защищ[её]нный чат/i);
    const headingText = heading.textContent ?? "";

    expect(protectedLabel.closest("h1")).toBe(heading);
    expect(headingText.indexOf(protectedLabel.textContent ?? "")).toBeGreaterThan(
      headingText.indexOf("#engineering"),
    );
  });

  it("renders the system general-chat topic in italic", () => {
    renderWithProviders(
      <ChatChannelHeader
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

  it("shows participant and online counters", () => {
    renderWithProviders(
      <ChatChannelHeader
        channelName="#engineering"
        hideTopic
        participantsCount={2}
        onlineCount={1}
      />,
    );

    expect(screen.getByText(/2 (members?|участник|участника)/i)).toBeInTheDocument();
  });

  it("does not expose channel title or right panel controls without panel handlers", () => {
    renderWithProviders(<ChatChannelHeader channelName="general" hideTopic hideParticipants />);

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
      <ChatChannelHeader
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
      <ChatChannelHeader
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

  it("hides the unfinished chat search action", () => {
    renderWithProviders(
      <ChatChannelHeader
        channelName="general"
        hideTopic
        hideParticipants
        onOpenSearch={vi.fn()}
        onToggleRightPanel={vi.fn()}
      />,
    );

    const actionButton = screen.getByRole("button", { name: /hide panel|скрыть панель/i });
    const controlsCluster = actionButton.parentElement;

    expect(screen.queryByRole("button", { name: /search/i })).not.toBeInTheDocument();
    expect(controlsCluster).not.toBeNull();
    expect(controlsCluster).toContainElement(actionButton);
  });
});
