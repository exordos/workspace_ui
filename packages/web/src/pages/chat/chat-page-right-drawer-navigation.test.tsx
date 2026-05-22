import { fireEvent, screen } from "@testing-library/react";
import React, { useCallback } from "react";
import { describe, expect, it } from "vitest";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { renderWithProviders } from "~/test/render";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";

const RightDrawerHeaderHarness: React.FC = () => {
  const rightDrawerOpen = useRightDrawerStore((s) => s.open);
  const setRightDrawerOpen = useRightDrawerStore((s) => s.setOpen);
  const openRightDrawerInfo = useRightDrawerStore((s) => s.openInfo);
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);

  const handleOpenRightPanel = useCallback(() => {
    // Поведение ChatPage: клик по шапке всегда возвращает на инфо чата.
    openRightDrawerInfo();
  }, [openRightDrawerInfo]);

  return (
    <RightDrawerContext.Provider
      value={{
        open: rightDrawerOpen,
        setOpen: setRightDrawerOpen,
        openInfo: openRightDrawerInfo,
        openUserProfile: openRightDrawerUserProfile,
      }}
    >
      <ChatHeader
        channelName="#engineering"
        topic="sprint-planning"
        hideTopic={false}
        hideParticipants={false}
        participantsCount={2}
        onlineCount={1}
        onOpenRightPanel={handleOpenRightPanel}
      />
    </RightDrawerContext.Provider>
  );
};

describe("ChatPage right drawer navigation", () => {
  it("returns to channel info when header is clicked after nested profile open", () => {
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: 42 });

    renderWithProviders(<RightDrawerHeaderHarness />);

    fireEvent.click(screen.getByRole("button", { name: /channel info|информация о канале/i }));

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
    });
  });
});
