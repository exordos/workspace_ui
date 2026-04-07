import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { clearLocalStatePreservingCriticalKeys } from "~/shared/lib/local-reset";
import { renderWithProviders } from "~/test/render";
import { ProfileDrawer } from "./profile-drawer.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateMock = vi.fn();
const confirmMock = vi.spyOn(window, "confirm");
const CURRENT_INSTANCE_ID = "instance-current";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("~/shared/lib/local-reset", () => ({
  clearLocalStatePreservingCriticalKeys: vi.fn(),
}));

describe("ProfileDrawer", () => {
  beforeEach(() => {
    useChatListStore.getState().setCurrentUserId(42);
    useInstancesStore.setState({
      instances: [
        {
          id: CURRENT_INSTANCE_ID,
          realm: "https://chat.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: CURRENT_INSTANCE_ID,
      unreadCountsByInstance: {},
    });
    confirmMock.mockReturnValue(true);
  });

  afterEach(() => {
    useChatListStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().setPalette("orange-warm");
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
    confirmMock.mockReset();
    navigateMock.mockReset();
  });

  it("cycles notification sound preference from the drawer", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);

    expect(useSettingsStore.getState().notificationSound).toBe("default");

    fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));

    expect(useSettingsStore.getState().notificationSound).toBe("subtle");
  });

  it("shows diagnostics entry and hides service catalog entry", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: /diagnostics/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /service catalog/i })).not.toBeInTheDocument();
  });

  it("hides add-server entry and shows current server with organization logout action", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);

    expect(screen.queryByRole("button", { name: /add server/i })).not.toBeInTheDocument();
    expect(screen.getByText(/current server/i)).toBeInTheDocument();
    expect(screen.getByText("chat.example.com")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    const logoutButton = screen.getByRole("button", { name: /logout from organization/i });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).toHaveClass("h-6");
    expect(logoutButton).toHaveClass("w-6");
    expect(logoutButton).not.toHaveTextContent(/logout from organization/i);
    expect(logoutButton.querySelector("svg")).toBeInTheDocument();
  });

  it("logs out from current organization from server card", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /logout from organization/i }));

    expect(confirmMock).toHaveBeenCalledWith("Log out from chat.example.com?");
    expect(useInstancesStore.getState().instances).toHaveLength(0);
    expect(useInstancesStore.getState().currentInstanceId).toBeNull();
  });

  it("opens logs route from diagnostics entry", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^diagnostics$/i }));
    expect(navigateMock).toHaveBeenCalledWith("/settings/logs");
  });

  it("opens settings sidebar from profile menu", () => {
    const onOpenChange = vi.fn();
    const onOpenSettingsDrawer = vi.fn();
    renderWithProviders(
      <ProfileDrawer
        open
        onOpenChange={onOpenChange}
        onOpenSettingsDrawer={onOpenSettingsDrawer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));

    expect(onOpenSettingsDrawer).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens current user profile sidebar from personal info entry", () => {
    const onOpenChange = vi.fn();
    const openUserProfile = vi.fn();
    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <ProfileDrawer open onOpenChange={onOpenChange} />
      </RightDrawerContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /personal info/i }));

    expect(openUserProfile).toHaveBeenCalledWith(42);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).not.toHaveBeenCalledWith("/settings/personal-info");
  });

  it("clears cache from drawer action", () => {
    const clearCacheMock = vi.mocked(clearLocalStatePreservingCriticalKeys);
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /clear cache/i }));
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
  });

  it("uses semantic text colors in light mode drawer content", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().setPalette("blue-cold");

    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);

    expect(screen.getByText(/^profile$/i)).toHaveClass("text-text-primary");
    expect(screen.getByRole("button", { name: /diagnostics/i })).toHaveClass("text-text-primary");
  });

  it("uses sidebar background token for drawer shell", () => {
    renderWithProviders(<ProfileDrawer open onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveClass("bg-sidebar-bg");
  });
});
