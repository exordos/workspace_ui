import { fireEvent, screen } from "@testing-library/react";
import React, { useCallback } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { renderWithProviders } from "~/test/render";
import { ChatChannelHeader } from "~/widgets/chat-view/chat-header-channel.ui";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";

const RightDrawerHeaderHarness: React.FC = () => {
  const rightDrawerOpen = useRightDrawerStore((s) => s.open);
  const setRightDrawerOpen = useRightDrawerStore((s) => s.setOpen);
  const toggleRightDrawerChatInfo = useRightDrawerStore((s) => s.toggleChatInfo);
  const openRightDrawerInfo = useRightDrawerStore((s) => s.openInfo);
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);
  const chatInfoOpen = useRightDrawerStore((s) => s.open && s.layers.at(-1)?.kind === "chat-info");

  const handleOpenRightPanel = useCallback(() => {
    // ChatPage behavior: header click always returns to chat info.
    openRightDrawerInfo();
  }, [openRightDrawerInfo]);

  return (
    <RightDrawerContext.Provider
      value={{
        open: rightDrawerOpen,
        chatInfoOpen,
        setOpen: setRightDrawerOpen,
        toggleChatInfo: toggleRightDrawerChatInfo,
        openInfo: openRightDrawerInfo,
        openUserProfile: openRightDrawerUserProfile,
      }}
    >
      <ChatChannelHeader
        channelName="#engineering"
        topic="sprint-planning"
        hideTopic={false}
        hideParticipants={false}
        participantsCount={2}
        onlineCount={1}
        onOpenRightPanel={handleOpenRightPanel}
        onToggleRightPanel={toggleRightDrawerChatInfo}
        rightPanelOpen={chatInfoOpen}
      />
    </RightDrawerContext.Provider>
  );
};

describe("ChatPage right drawer navigation", () => {
  afterEach(() => useRightDrawerStore.getState().clearAll());

  it("returns to channel info when header is clicked after nested profile open", () => {
    useRightDrawerStore.getState().clearAll();
    useRightDrawerStore.getState().openInfo();
    useRightDrawerStore.getState().openUserProfile(42);

    renderWithProviders(<RightDrawerHeaderHarness />);

    fireEvent.click(screen.getByRole("button", { name: /channel info|информация о канале/i }));

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
    });
  });

  it("opens chat info over account settings in one click and X restores settings", () => {
    useRightDrawerStore.getState().openUserMenu();
    useRightDrawerStore.getState().openSettings();

    renderWithProviders(<RightDrawerHeaderHarness />);

    const infoButtons = screen.getAllByRole("button", {
      name: /channel info|информация о канале/i,
    });
    fireEvent.click(infoButtons.at(-1)!);

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      accountScreen: null,
    });

    useRightDrawerStore.getState().closeCurrent();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "user-menu",
      accountScreen: "settings",
    });
  });
});
