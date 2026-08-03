import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSelfChatViewState } from "~/features/workspace-self-chat/workspace-self-chat.hook";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { FavoritesPage } from "./chat-page.ui";

const mocked = vi.hoisted(() => ({
  useWorkspaceSelfChat: vi.fn(),
}));

vi.mock("~/features/workspace-self-chat/workspace-self-chat.hook", () => ({
  useWorkspaceSelfChat: mocked.useWorkspaceSelfChat,
}));

vi.mock("./chat-page-workspace.ui", () => ({
  WorkspaceChatPage: () => <div data-testid="workspace-chat-page" />,
}));

function renderFavoritesPage(state: WorkspaceSelfChatViewState, setOpen: (open: boolean) => void) {
  mocked.useWorkspaceSelfChat.mockReturnValue(state);
  return render(
    <MemoryRouter initialEntries={["/org/org-a/project/project-a/activity/favorites"]}>
      <RightDrawerContext.Provider value={{ open: true, setOpen }}>
        <FavoritesPage />
      </RightDrawerContext.Provider>
    </MemoryRouter>,
  );
}

describe("FavoritesPage", () => {
  beforeEach(() => {
    mocked.useWorkspaceSelfChat.mockReset();
  });

  it.each([
    {
      name: "loading",
      state: { status: "loading", route: null, error: null, retry: vi.fn() } as const,
    },
    {
      name: "error",
      state: { status: "error", route: null, error: "failed", retry: vi.fn() } as const,
    },
  ])("closes the right panel immediately in the $name state", async ({ state }) => {
    const setOpen = vi.fn();

    renderFavoritesPage(state, setOpen);

    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
    expect(mocked.useWorkspaceSelfChat).toHaveBeenCalledWith({
      organizationId: "org-a",
      projectId: "project-a",
    });
  });
});
