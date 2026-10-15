import { act, screen } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateChatDialogProps } from "~/features/create-chat/create-chat-dialog.types";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SIDEBAR_SYSTEM_ALL_FOLDER_ID } from "./sidebar-folder.constants";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";

const CREATED_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
vi.mock("~/features/create-chat/create-chat-dialog.ui", () => ({
  CreateChatDialog: ({ open, onNavigateWorkspaceStream }: CreateChatDialogProps) =>
    open ? (
      <>
        <button onClick={() => onNavigateWorkspaceStream?.(CREATED_UUID, true)}>
          Complete encrypted creation
        </button>
        <button onClick={() => onNavigateWorkspaceStream?.(CREATED_UUID)}>
          Complete ordinary creation
        </button>
      </>
    ) : null,
}));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
afterEach(() =>
  useSidebarConfigStore.setState({
    createChatOpen: false,
    searchQuery: "",
    activityOpen: false,
    selectedFolderId: SIDEBAR_SYSTEM_ALL_FOLDER_ID,
  }),
);

function setup() {
  const openInfo = vi.fn();
  useSidebarConfigStore.setState({
    createChatOpen: true,
    searchQuery: "old search",
    activityOpen: true,
    selectedFolderId: "custom",
  });
  renderWithProviders(
    <RightDrawerContext.Provider
      value={{
        open: false,
        setOpen: vi.fn(),
        toggleChatInfo: vi.fn(),
        closeCurrent: vi.fn(),
        openInfo,
      }}
    >
      <WorkspaceSidebar
        streams={[]}
        loading={false}
        error={null}
        activityCounts={{ inboxCount: null, mentionsCount: null }}
        workspaceStreamCount={0}
      />
      <LocationProbe />
    </RightDrawerContext.Provider>,
    { route: "/org/acme/project/project-a/stream/old-stream" },
  );
  return openInfo;
}

describe("normal encrypted creation navigation", () => {
  it("navigates to the actual UUID, reveals All chats and opens info once", () => {
    const openInfo = setup();
    act(() => screen.getByRole("button", { name: "Complete encrypted creation" }).click());
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/org/acme/project/project-a/stream/${CREATED_UUID}`,
    );
    expect(openInfo).toHaveBeenCalledTimes(1);
    expect(useSidebarConfigStore.getState()).toMatchObject({
      createChatOpen: false,
      searchQuery: "",
      activityOpen: false,
      selectedFolderId: SIDEBAR_SYSTEM_ALL_FOLDER_ID,
    });
    act(() => useSidebarConfigStore.setState({ searchQuery: "changed" }));
    expect(openInfo).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary creation navigation and drawer behavior", () => {
    const openInfo = setup();
    act(() => screen.getByRole("button", { name: "Complete ordinary creation" }).click());
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/org/acme/project/project-a/stream/${CREATED_UUID}`,
    );
    expect(openInfo).not.toHaveBeenCalled();
    expect(useSidebarConfigStore.getState()).toMatchObject({
      createChatOpen: false,
      searchQuery: "old search",
      activityOpen: true,
      selectedFolderId: "custom",
    });
  });
});
