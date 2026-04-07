import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { SettingsPage } from "./settings-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const unregisterSpy = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const wipeCredentialsSpy = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/lib/push/push.service", () => ({
  pushService: {
    unregister: unregisterSpy,
  },
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  wipeCredentials: wipeCredentialsSpy,
}));

describe("SettingsPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    unregisterSpy.mockReset();
    wipeCredentialsSpy.mockReset();
    useSettingsStore.getState().resetToDefaults();
    useThemeStore.setState({ mode: "dark", paletteId: "orange-warm" });
    act(() => {
      setLocale("en");
    });
  });

  it("routes to personal info/diagnostics/build sections", () => {
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /personal info/i }));
    fireEvent.click(screen.getByRole("button", { name: /^diagnostics$/i }));
    fireEvent.click(screen.getByRole("button", { name: /select build/i }));

    expect(navigateSpy).toHaveBeenNthCalledWith(1, "/settings/personal-info");
    expect(navigateSpy).toHaveBeenNthCalledWith(2, "/settings/logs");
    expect(navigateSpy).toHaveBeenNthCalledWith(3, "/settings/build");
  });

  it("does not render service catalog entry in settings menu", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.queryByRole("button", { name: /service catalog/i })).not.toBeInTheDocument();
  });

  it("cycles notification sound and language", () => {
    renderWithProviders(<SettingsPage />);

    expect(useSettingsStore.getState().notificationSound).toBe("default");
    expect(useSettingsStore.getState().language).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /language/i }));
    });

    expect(useSettingsStore.getState().notificationSound).toBe("subtle");
    expect(useSettingsStore.getState().language).toBe("ru");
  });

  it("updates unread-priority chat sorting flags", () => {
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /chat sorting/i }));
    fireEvent.click(screen.getByRole("button", { name: /unread personal chats/i }));
    fireEvent.click(screen.getByRole("button", { name: /unread unmuted channels/i }));

    expect(useSettingsStore.getState().prioritizePersonalUnread).toBe(true);
    expect(useSettingsStore.getState().prioritizeUnmutedUnreadChannels).toBe(true);
  });

  it("switches folder layout mode in settings", () => {
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /folder layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /horizontal tabs/i }));
    expect(useSettingsStore.getState().folderRailLayout).toBe("horizontal");

    fireEvent.click(screen.getByRole("button", { name: /vertical rail/i }));
    expect(useSettingsStore.getState().folderRailLayout).toBe("vertical");
  });

  it("logs out from settings page", () => {
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    expect(wipeCredentialsSpy).toHaveBeenCalledTimes(1);
    expect(unregisterSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith("/login");
  });

  it("shows theme settings controls and updates theme mode/palette", () => {
    useThemeStore.setState({ mode: "dark", paletteId: "orange-warm" });

    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /theme settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /light/i }));

    expect(useThemeStore.getState().mode).toBe("light");

    fireEvent.click(screen.getByTestId("settings-theme-palette-blue-cold"));
    expect(useThemeStore.getState().paletteId).toBe("blue-cold");

    fireEvent.click(screen.getByTestId("settings-theme-palette-blue-mist"));
    expect(useThemeStore.getState().paletteId).toBe("blue-mist");
  });
});
