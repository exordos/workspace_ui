import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "./right-drawer.model";
import { RightPanelUser } from "./right-panel-user.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("RightPanelUser", () => {
  afterEach(() => {
    useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
    useChatListStore.getState().clear();
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    navigateMock.mockReset();
  });

  it("shows back control when user profile was opened on top of chat info and clears override on click", async () => {
    const user = userEvent.setup();
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: 99 });

    renderWithProviders(
      <RightPanelUser user={{ name: "Test User", userId: 99 }} onOpenDirectMessage={vi.fn()} />,
    );

    const back = screen.getByRole("button", { name: /back/i });
    expect(back).toBeInTheDocument();

    await user.click(back);

    expect(useRightDrawerStore.getState().userIdOverride).toBeNull();
  });

  it("does not show back when there is no userId override", () => {
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: null });

    renderWithProviders(<RightPanelUser user={{ name: "Partner", userId: 1 }} />);

    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("navigates to personal info settings by clicking own avatar", async () => {
    const user = userEvent.setup();
    useChatListStore.getState().setCurrentUserId(42);

    renderWithProviders(<RightPanelUser user={{ name: "Me", userId: 42, avatarUrl: null }} />);

    const avatarButton = screen.getByRole("button", { name: /change avatar/i });
    expect(avatarButton).toBeInTheDocument();

    await user.click(avatarButton);
    expect(navigateMock).toHaveBeenCalledWith(withCurrentOrgRoute("/settings/personal-info"));
  });

  it("does not show change-avatar action for another user profile", () => {
    useChatListStore.getState().setCurrentUserId(7);
    renderWithProviders(<RightPanelUser user={{ name: "Partner", userId: 42 }} />);
    expect(screen.queryByRole("button", { name: /change avatar/i })).not.toBeInTheDocument();
  });

  it("hides profile call button when user account is deactivated", () => {
    useChatListStore.getState().setCurrentUserId(7);
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(vi.fn());

    renderWithProviders(
      <RightPanelUser user={{ name: "Deactivated User", userId: 99, isActive: false }} />,
    );

    expect(screen.queryByRole("button", { name: /^call$/i })).not.toBeInTheDocument();
  });
});
