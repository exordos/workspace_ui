import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelUserAppearance, RightPanelUserSettings } from "./right-panel-user-settings.ui";

vi.mock("~/shared/lib/notification-sound", () => ({
  playNotificationSound: vi.fn(),
}));

describe("RightPanelUserSettings", () => {
  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
    useThemeStore.setState({ mode: "system", paletteId: "blue-cold" });
    setLocale("en");
  });

  it("navigates back and closes from the nested header", () => {
    const onBack = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(<RightPanelUserSettings onBack={onBack} onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).not.toHaveAccessibleName("Settings");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("associates each independent settings trigger with its expandable region", () => {
    renderWithProviders(<RightPanelUserSettings onBack={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByTestId("right-panel-settings-sound-trigger")).toHaveClass(
      "-mx-2",
      "w-[calc(100%+1rem)]",
      "px-2",
      "py-1.5",
    );

    expect(screen.getByTestId("right-panel-settings-sound-trigger")).not.toHaveAttribute(
      "aria-label",
    );
    expect(screen.getByTestId("right-panel-settings-language-trigger")).not.toHaveAttribute(
      "aria-label",
    );
    expect(screen.getByTestId("right-panel-settings-timeout-trigger")).not.toHaveAttribute(
      "aria-label",
    );
    expect(screen.getByTestId("right-panel-settings-sound-trigger")).toHaveAccessibleName(
      /notification sound.*default/i,
    );
    expect(screen.getByTestId("right-panel-settings-language-trigger")).toHaveAccessibleName(
      /language.*english/i,
    );
    expect(screen.getByTestId("right-panel-settings-timeout-trigger")).toHaveAccessibleName(
      /auto sign-out.*3 days/i,
    );

    const sections = [
      ["sound", "right-panel-settings-sound-options"],
      ["language", "right-panel-settings-language-options"],
      ["timeout", "right-panel-settings-timeout-options"],
    ] as const;

    for (const [section, panelId] of sections) {
      const trigger = screen.getByTestId(`right-panel-settings-${section}-trigger`);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-controls", panelId);
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(trigger).toHaveClass("-mx-2", "w-[calc(100%+1rem)]", "px-2");
      const panel = screen.getByTestId(panelId);
      expect(panel).toHaveAttribute("id", panelId);
      expect(panel).toHaveAttribute("role", "region");
      expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
      expect(panel).toHaveClass(
        "w-full",
        "p-2",
        "[&>li]:-mx-2",
        "[&>li]:w-[calc(100%+1rem)]",
        "[&>li]:px-2",
        "[&>li]:py-2",
        "[&>li:first-child]:-mt-2",
        "[&>li:last-child]:-mb-2",
        "[&>li:hover]:bg-card-bg-active",
        "[&>li+li]:before:inset-x-2",
        "[&>li+li]:before:top-0",
      );
      expect(panel).not.toHaveClass("-mx-2", "w-[calc(100%+1rem)]");
    }

    expect(screen.getByTestId("right-panel-settings-sound-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-language-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-timeout-options")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Default" })).toHaveClass(
      "hover:bg-card-bg-active",
      "focus-visible:bg-card-bg-active",
    );
  });

  it("keeps settings sections independently expanded and applies sound and timeout actions", () => {
    renderWithProviders(<RightPanelUserSettings onBack={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));
    expect(screen.getByTestId("right-panel-settings-sound-options")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /language/i }));
    expect(screen.getByTestId("right-panel-settings-sound-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-language-options")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /auto sign-out/i }));
    expect(screen.getByTestId("right-panel-settings-sound-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-language-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-timeout-options")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));
    expect(screen.queryByTestId("right-panel-settings-sound-options")).not.toBeInTheDocument();
    expect(screen.getByTestId("right-panel-settings-language-options")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "6 hours" }));
    expect(useSettingsStore.getState().authIdleTimeout).toBe("6h");
    expect(screen.getByTestId("right-panel-settings-timeout-options")).toBeInTheDocument();
  });
});

describe("RightPanelUserAppearance", () => {
  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
    useThemeStore.setState({ mode: "system", paletteId: "blue-cold" });
  });

  it("applies theme mode, palette, sorting, folder layout, and density actions", () => {
    renderWithProviders(<RightPanelUserAppearance onBack={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).not.toHaveAccessibleName("Appearance");

    fireEvent.click(screen.getByRole("button", { name: /theme settings/i }));
    fireEvent.click(screen.getByTestId("settings-theme-mode-dark"));
    fireEvent.click(screen.getByTestId("settings-theme-palette-emerald-chat"));
    expect(useThemeStore.getState().mode).toBe("dark");
    expect(useThemeStore.getState().paletteId).toBe("emerald-chat");

    fireEvent.click(screen.getByRole("button", { name: /stream and topic order/i }));
    fireEvent.click(screen.getByRole("button", { name: "Unread first" }));
    expect(useSettingsStore.getState().messengerSidebarSortMode).toBe("unread_first");

    fireEvent.click(screen.getByRole("button", { name: /folder layout/i }));
    fireEvent.click(screen.getByRole("button", { name: "Horizontal tabs" }));
    expect(useSettingsStore.getState().folderRailLayout).toBe("horizontal");

    fireEvent.click(screen.getByRole("button", { name: /chat list density/i }));
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(useSettingsStore.getState().chatListDensity).toBe("compact");
    expect(screen.getByTestId("right-panel-appearance-theme-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-sorting-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-folder-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-density-options")).toBeInTheDocument();
  });

  it("uses the Figma theme glyph for each mode segment", () => {
    renderWithProviders(<RightPanelUserAppearance onBack={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /theme settings/i }));

    // Figma Bridge 17068:37729 uses these exact leaf-vector exports.
    const expectedIcons = [
      ["light", "18", "0 0 18 18", "#FFD633"],
      ["dark", "16", "0 0 16 16", "#F7FDFF"],
      ["system", "17", "0 0 17 15", "#707070"],
    ] as const;

    for (const [mode, size, viewBox, fill] of expectedIcons) {
      const button = screen.getByTestId(`settings-theme-mode-${mode}`);
      const icon = button.querySelector("svg");
      expect(button).toHaveClass("rounded-[8px]");
      expect(icon?.parentElement).toHaveClass("h-5", "w-5");
      expect(icon).toHaveAttribute("width", size);
      expect(icon).toHaveAttribute("height", size);
      expect(icon).toHaveAttribute("viewBox", viewBox);
      expect(icon?.querySelector("path")).toHaveAttribute("fill", fill);
    }

    const segmentGroup = screen.getByTestId("settings-theme-mode-system").parentElement;
    expect(segmentGroup).toHaveClass("rounded-[8px]", "p-1", "gap-2");
    expect(screen.getByTestId("settings-theme-mode-system")).toHaveClass("bg-card-bg");
    expect(screen.getByTestId("settings-theme-mode-system")).not.toHaveClass("bg-card-bg-active");

    fireEvent.click(screen.getByTestId("settings-theme-mode-dark"));
    expect(screen.getByTestId("settings-theme-mode-dark")).toHaveClass("bg-card-bg");
    expect(screen.getByTestId("settings-theme-mode-dark")).not.toHaveClass("bg-card-bg-active");
  });

  it("uses the Figma list_arrow glyph for stream and topic order", () => {
    renderWithProviders(<RightPanelUserAppearance onBack={vi.fn()} onClose={vi.fn()} />);

    const sortingTrigger = screen.getByTestId("right-panel-appearance-sorting-trigger");
    const sortingIcon = sortingTrigger.querySelector("svg");

    expect(sortingIcon).toHaveAttribute("viewBox", "0 0 24 17");
    expect(sortingIcon?.querySelector("path")).toHaveAttribute("fill", "#707070");
  });

  it("keeps all appearance regions open and linked independently", () => {
    renderWithProviders(<RightPanelUserAppearance onBack={vi.fn()} onClose={vi.fn()} />);

    const appearanceSections = screen.getByTestId("right-panel-appearance-sections");
    expect(appearanceSections).toHaveClass(
      "space-y-0",
      "px-2",
      "[&>div+div]:before:top-0",
      "[&>div+div]:before:inset-x-0",
    );
    expect(appearanceSections.children).toHaveLength(4);

    expect(screen.getByTestId("right-panel-appearance-theme-trigger")).toHaveClass(
      "-mx-2",
      "w-[calc(100%+1rem)]",
      "px-2",
      "py-1.5",
    );

    const sections = [
      ["theme", "right-panel-appearance-theme-options"],
      ["sorting", "right-panel-appearance-sorting-options"],
      ["folder", "right-panel-appearance-folder-options"],
      ["density", "right-panel-appearance-density-options"],
    ] as const;

    for (const [section, panelId] of sections) {
      const trigger = screen.getByTestId(`right-panel-appearance-${section}-trigger`);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-controls", panelId);
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(trigger).toHaveClass("-mx-2", "w-[calc(100%+1rem)]", "px-2");
      const panel = screen.getByTestId(panelId);
      expect(panel).toHaveAttribute("role", "region");
      expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
      expect(panel).toHaveClass(
        "w-full",
        "rounded-[8px]",
        "[&>li]:-mx-2",
        "[&>li]:w-[calc(100%+1rem)]",
        "[&>li]:px-2",
        "[&>li]:py-2",
        "[&>li:first-child]:-mt-2",
        "[&>li:last-child]:-mb-2",
        "[&>li:hover]:bg-card-bg-active",
        "[&>li+li]:before:inset-x-2",
        "[&>li+li]:before:top-0",
      );
      expect(panel).not.toHaveClass("-mx-2", "w-[calc(100%+1rem)]");
    }

    expect(screen.getByTestId("right-panel-appearance-theme-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-sorting-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-folder-options")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-appearance-density-options")).toBeInTheDocument();
  });
});
