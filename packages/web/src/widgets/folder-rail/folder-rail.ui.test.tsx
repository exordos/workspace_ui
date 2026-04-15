import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { folderColorValueToCssHex } from "~/features/manage-folders/folder-colors";
import * as manageFolders from "~/features/manage-folders/manage-folders.api";
import { useSettingsStore } from "~/features/settings/settings.model";
import { applyTheme } from "~/shared/lib/themes/engine";
import { FolderRail } from "./folder-rail.ui";

describe("FolderRail visual parity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.getState().resetToDefaults();
  });

  it("applies folder color to selected custom folder in horizontal layout", () => {
    const customColor = 0x3a92ff;

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: customColor },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const customButton = screen.getByRole("button", { name: "Team" });
    const customLabel = within(customButton).getByText("Team");

    const customIconWrapper = customButton.querySelector("svg")?.parentElement;
    expect(customButton).toHaveStyle({ color: folderColorValueToCssHex(customColor) });
    expect(customIconWrapper).toHaveStyle({ color: folderColorValueToCssHex(customColor) });
    expect(customLabel).toBeInTheDocument();

    const iconPath = customButton.querySelector("path");
    expect(iconPath?.getAttribute("fill")).toBe("currentColor");
  });

  it("keeps custom folder icon color when unselected and applies label color on hover in horizontal layout", () => {
    const customColor = 0x3a92ff;

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: customColor },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const customButton = screen.getByRole("button", { name: "Team" });
    const customLabel = within(customButton).getByText("Team");

    const customIconWrapper = customButton.querySelector("svg")?.parentElement;
    expect(customIconWrapper).toHaveStyle({ color: folderColorValueToCssHex(customColor) });
    expect(customButton.getAttribute("style")).toBeNull();
    expect(customLabel).toBeInTheDocument();

    fireEvent.mouseEnter(customButton);

    expect(customIconWrapper).toHaveStyle({ color: folderColorValueToCssHex(customColor) });
    expect(customButton).toHaveStyle({ color: folderColorValueToCssHex(customColor) });
  });

  it("highlights all-folder label on hover in horizontal layout", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const allButton = screen.getByRole("button", { name: "All" });
    const allLabel = within(allButton).getByText("All");
    expect(allButton).toHaveClass("text-text-muted");
    expect(allLabel).toBeInTheDocument();

    fireEvent.mouseEnter(allButton);

    expect(allButton).toHaveClass("text-accent");
  });

  it("renders vertical passive custom folder with muted token styling and stable slot size", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    const customLabel = customNodes.find((node) => node.tagName === "SPAN");
    expect(customButton).toBeDefined();
    expect(customLabel).toBeDefined();

    const visualWrapper = customButton?.parentElement;
    const outerSlot = customButton?.parentElement?.parentElement;
    expect(outerSlot).toHaveClass("h-[72px]");
    expect(outerSlot).toHaveClass("w-[56px]");
    expect(outerSlot).toHaveClass("p-1");
    expect(visualWrapper).toHaveClass("scale-100");
    expect(visualWrapper).not.toHaveClass("scale-110");
    expect(customButton).toHaveClass("text-text-muted");
    expect(customLabel).toHaveClass("text-text-muted");
    expect(customLabel).toHaveClass("text-xs");
    expect(customLabel).toHaveClass("leading-4");
    expect(customButton?.getAttribute("style")).toBeNull();
    expect(customLabel?.getAttribute("style")).toBeNull();
  });

  it("renders vertical active custom folder with contrast styling and scale highlight", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    const customLabel = customNodes.find((node) => node.tagName === "SPAN");
    expect(customButton).toBeDefined();
    expect(customLabel).toBeDefined();

    const visualWrapper = customButton?.parentElement;
    const outerSlot = customButton?.parentElement?.parentElement;
    expect(outerSlot).toHaveClass("h-[72px]");
    expect(outerSlot).toHaveClass("w-[56px]");
    expect(outerSlot).toHaveClass("p-1");
    expect(visualWrapper).toHaveClass("scale-110");
    expect(visualWrapper).not.toHaveClass("scale-100");
    expect(customButton).toHaveClass("text-text-primary");
    expect(customLabel).toHaveClass("text-text-primary");
  });

  it("uses primary text token for active system folder in vertical view", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const allNodes = screen.getAllByTitle("All");
    const allButton = allNodes.find((node) => node.tagName === "BUTTON");
    const allLabel = allNodes.find((node) => node.tagName === "SPAN");
    expect(allButton).toHaveClass("text-text-primary");
    expect(allLabel).toHaveClass("text-text-primary");
  });

  it("uses primary text token for selected all-folder in horizontal layout", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const allButton = screen.getByRole("button", { name: "All" });
    const allIconWrapper = allButton.querySelector("svg")?.parentElement;

    expect(allButton).toHaveClass("text-text-primary");
    expect(allIconWrapper).toHaveClass("text-text-primary");
  });

  it("keeps vertical token classes stable for blue-cold and emerald-chat in light/dark modes", () => {
    const themeScenarios = [
      { paletteId: "blue-cold", mode: "light" as const },
      { paletteId: "blue-cold", mode: "dark" as const },
      { paletteId: "emerald-chat", mode: "light" as const },
      { paletteId: "emerald-chat", mode: "dark" as const },
    ];

    for (const { paletteId, mode } of themeScenarios) {
      applyTheme(paletteId, mode);
      const view = render(
        <FolderRail
          folders={[
            { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
            { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
          ]}
          selectedFolderId="custom"
          onSelectFolder={vi.fn()}
        />,
      );

      const customNodes = screen.getAllByTitle("Team");
      const customButton = customNodes.find((node) => node.tagName === "BUTTON");
      const customLabel = customNodes.find((node) => node.tagName === "SPAN");
      expect(customButton).toHaveClass("text-text-primary");
      expect(customLabel).toHaveClass("text-text-primary");
      expect(customButton?.getAttribute("style")).toBeNull();
      expect(customLabel?.getAttribute("style")).toBeNull();

      view.unmount();
    }
  });

  it("renders all-folder icon with dedicated provided glyph", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const allNodes = screen.getAllByTitle("All");
    const allButton = allNodes.find((node) => node.tagName === "BUTTON");
    expect(allButton).toBeDefined();

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    const allIconPath = allButton?.querySelector("path");
    const customIconPath = customButton?.querySelector("path");
    expect(allIconPath).toHaveAttribute("fill", "currentColor");
    expect(customIconPath).toHaveAttribute("fill", "currentColor");
    expect(allIconPath?.getAttribute("d")).not.toBe(customIconPath?.getAttribute("d"));
  });

  it("renders dedicated icons for personal and channels system folders", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
          {
            id: "system:personal",
            label: "Personal",
            backgroundColor: 0,
            systemType: "personal",
          },
          {
            id: "system:channels",
            label: "Channels",
            backgroundColor: 0,
            systemType: "channels",
          },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const personalNodes = screen.getAllByTitle("Personal");
    const channelsNodes = screen.getAllByTitle("Channels");
    const personalButton = personalNodes.find((node) => node.tagName === "BUTTON");
    const channelsButton = channelsNodes.find((node) => node.tagName === "BUTTON");
    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(personalButton).toBeDefined();
    expect(channelsButton).toBeDefined();
    expect(customButton).toBeDefined();

    const personalIconPath = personalButton?.querySelector("path");
    const channelsIconPath = channelsButton?.querySelector("path");
    const customIconPath = customButton?.querySelector("path");

    expect(personalIconPath).toHaveAttribute("fill", "currentColor");
    expect(channelsIconPath).toHaveAttribute("fill", "currentColor");
    expect(personalIconPath?.getAttribute("d")).not.toBe(channelsIconPath?.getAttribute("d"));
    expect(personalIconPath?.getAttribute("d")).not.toBe(customIconPath?.getAttribute("d"));
  });

  it("uses currentColor for add-folder icon fill", () => {
    render(
      <FolderRail
        folders={[{ id: "all", label: "All", backgroundColor: 0xff8438 }]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const addFolderButton = screen.getByRole("button", { name: "Add folder" });
    expect(addFolderButton).toHaveClass("h-8");
    expect(addFolderButton).toHaveClass("w-8");
    expect(addFolderButton).not.toHaveClass("border-border-subtle");
    const addIconPath = addFolderButton.querySelector("path");
    expect(addIconPath?.getAttribute("fill")).toBe("currentColor");
  });

  it("renders vertical view composition and keeps folder selection clickable", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={onSelectFolder}
      />,
    );

    const verticalRoot = screen.getByTestId("folder-rail-vertical");
    expect(verticalRoot).toHaveAttribute("data-folder-rail-view", "vertical");

    const teamButton = screen
      .getAllByRole("button", { name: "Team" })
      .find((node) => node.tagName === "BUTTON");
    expect(teamButton).toBeDefined();

    await user.click(teamButton!);
    expect(onSelectFolder).toHaveBeenCalledWith("custom");
  });

  it("renders horizontal layout variant and keeps folder selection clickable", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={onSelectFolder}
        layout="horizontal"
      />,
    );

    const horizontalRoot = screen.getByTestId("folder-rail-horizontal");
    expect(horizontalRoot).toHaveClass("overflow-x-auto");
    expect(horizontalRoot).toHaveClass("scrollbar-none");
    expect(horizontalRoot).toHaveClass("overflow-y-hidden");
    expect(horizontalRoot).toHaveAttribute("data-folder-rail-view", "horizontal");

    await user.click(screen.getByRole("button", { name: "Team" }));
    expect(onSelectFolder).toHaveBeenCalledWith("custom");
  });

  it("supports mouse drag scrolling in horizontal layout", () => {
    const onSelectFolder = vi.fn();
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 18 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail
        folders={manyFolders}
        selectedFolderId="all"
        onSelectFolder={onSelectFolder}
        layout="horizontal"
      />,
    );

    const horizontalRoot = screen.getByTestId("folder-rail-horizontal");
    expect(horizontalRoot).toHaveClass("overflow-x-auto");
    expect(horizontalRoot).toHaveClass("overflow-y-hidden");
    expect(horizontalRoot).toHaveClass("scrollbar-none");
    expect(horizontalRoot).toHaveClass("cursor-grab");

    const teamButton = screen.getByRole("button", { name: "Team 1" });

    fireEvent.pointerDown(teamButton, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 220,
    });
    expect(horizontalRoot).toHaveClass("cursor-grabbing");

    fireEvent.pointerMove(horizontalRoot, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 140,
    });
    fireEvent.pointerUp(horizontalRoot, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 140,
    });

    expect(horizontalRoot).toHaveClass("cursor-grab");
    expect(horizontalRoot.scrollLeft).toBeGreaterThan(0);

    fireEvent.click(teamButton);
    expect(onSelectFolder).not.toHaveBeenCalled();
  });

  it("opens add-folder modal in horizontal layout", async () => {
    const user = userEvent.setup();
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 18 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail
        folders={manyFolders}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const addFolderButton = screen.getByRole("button", { name: "Add folder" });
    await user.click(addFolderButton);

    expect(screen.getByText("Create folder")).toBeInTheDocument();
  });

  it("does not start horizontal drag when pressing add-folder button", async () => {
    const user = userEvent.setup();
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 18 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail
        folders={manyFolders}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const horizontalRoot = screen.getByTestId("folder-rail-horizontal");
    const addFolderButton = screen.getByRole("button", { name: "Add folder" });

    fireEvent.pointerDown(addFolderButton, {
      button: 0,
      pointerId: 11,
      pointerType: "mouse",
      clientX: 260,
    });
    expect(horizontalRoot).toHaveClass("cursor-grab");
    expect(horizontalRoot).not.toHaveClass("cursor-grabbing");

    await user.click(addFolderButton);
    expect(screen.getByText("Create folder")).toBeInTheDocument();
  });

  it("opens add-folder modal when clicking icon svg target in horizontal layout", () => {
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 18 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail
        folders={manyFolders}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const addFolderButton = screen.getByRole("button", { name: "Add folder" });
    const addFolderIconPath = addFolderButton.querySelector("path");
    expect(addFolderIconPath).not.toBeNull();

    fireEvent.click(addFolderIconPath!);

    expect(screen.getByText("Create folder")).toBeInTheDocument();
  });

  it("keeps all fixed, places add in scroll flow, and supports quick folder search for many folders", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 14 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail folders={manyFolders} selectedFolderId="all" onSelectFolder={onSelectFolder} />,
    );

    const scrollList = screen.getByTestId("folder-rail-scroll-list");
    const allButton = screen
      .getAllByRole("button", { name: "All" })
      .find((node) => node.tagName === "BUTTON");
    const addFolderButton = screen.getByRole("button", { name: "Add folder" });
    expect(allButton).toBeDefined();
    expect(scrollList).not.toContainElement(allButton ?? null);
    expect(scrollList).toContainElement(addFolderButton);
    const teamOneButton = screen
      .getAllByRole("button", { name: "Team 1" })
      .find((node) => node.tagName === "BUTTON");
    expect(teamOneButton).toBeDefined();
    expect(scrollList).toContainElement(teamOneButton ?? null);
    const scrollListButtons = within(scrollList).getAllByRole("button");
    expect(scrollListButtons.at(-1)).toBe(addFolderButton);

    const quickListButton = screen.getByRole("button", { name: "Open folder list" });
    await user.click(quickListButton);

    const searchInput = await screen.findByPlaceholderText("Search folders");
    await user.type(searchInput, "Team 12");

    const quickList = screen.getByTestId("folder-quick-list");
    expect(within(quickList).getByRole("button", { name: "Team 12" })).toBeInTheDocument();
    expect(within(quickList).queryByRole("button", { name: "Team 1" })).not.toBeInTheDocument();

    await user.click(within(quickList).getByRole("button", { name: "Team 12" }));
    expect(onSelectFolder).toHaveBeenCalledWith("folder-12");
  });

  it("opens quick list via shortcut, autofocuses search, and supports arrow + enter selection", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();
    const manyFolders = [
      { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" as const },
      ...Array.from({ length: 14 }, (_, idx) => ({
        id: `folder-${idx + 1}`,
        label: `Team ${idx + 1}`,
        backgroundColor: 0x3a92ff,
      })),
    ];

    render(
      <FolderRail folders={manyFolders} selectedFolderId="all" onSelectFolder={onSelectFolder} />,
    );

    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true });

    const searchInput = await screen.findByPlaceholderText("Search folders");
    await waitFor(() => {
      expect(searchInput).toHaveFocus();
    });

    await user.type(searchInput, "Team 1");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelectFolder).toHaveBeenCalledWith("folder-10");
  });

  it("renders delete folder action as destructive style", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);

    const deleteAction = screen.getByText("Delete");
    expect(deleteAction).toHaveClass("text-notice-base");

    const deleteItem = deleteAction.closest("[role='menuitem']");
    const deleteIconPath = deleteItem?.querySelector("path");
    expect(deleteIconPath?.getAttribute("fill")).toBe("currentColor");
  });

  it("does not show order pinning action in folder context menu", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);

    expect(screen.queryByRole("menuitem", { name: "Order pinning" })).not.toBeInTheDocument();
  });

  it("shows 'Display horizontally' in vertical layout and toggles layout from folder menu", () => {
    const onToggleLayout = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        onToggleLayout={onToggleLayout}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Display horizontally" }));

    expect(onToggleLayout).toHaveBeenCalledTimes(1);
  });

  it("shows 'Display vertically' in horizontal layout and toggles layout from folder menu", () => {
    const onToggleLayout = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        onToggleLayout={onToggleLayout}
        layout="horizontal"
      />,
    );

    const teamButton = screen.getByRole("button", { name: "Team" });
    fireEvent.contextMenu(teamButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Display vertically" }));

    expect(onToggleLayout).toHaveBeenCalledTimes(1);
  });

  it("keeps display-vertically menu action clickable in horizontal layout", () => {
    const onToggleLayout = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          ...Array.from({ length: 8 }, (_, idx) => ({
            id: `folder-${idx + 1}`,
            label: `Team ${idx + 1}`,
            backgroundColor: 0x3a92ff,
          })),
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        onToggleLayout={onToggleLayout}
        layout="horizontal"
      />,
    );

    const teamButton = screen.getByRole("button", { name: "Team 1" });

    fireEvent.contextMenu(teamButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Display vertically" }));

    expect(onToggleLayout).toHaveBeenCalledTimes(1);
  });

  it("does not enter drag state when clicking horizontal menu items from portal", () => {
    const onToggleLayout = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        onToggleLayout={onToggleLayout}
        layout="horizontal"
      />,
    );

    const horizontalRoot = screen.getByTestId("folder-rail-horizontal");
    const teamButton = screen.getByRole("button", { name: "Team" });
    fireEvent.contextMenu(teamButton);

    const displayVerticallyItem = screen.getByRole("menuitem", { name: "Display vertically" });
    fireEvent.pointerDown(displayVerticallyItem, {
      button: 0,
      pointerId: 17,
      pointerType: "mouse",
      clientX: 120,
    });

    expect(horizontalRoot).toHaveClass("cursor-grab");
    expect(horizontalRoot).not.toHaveClass("cursor-grabbing");

    fireEvent.click(displayVerticallyItem);

    expect(onToggleLayout).toHaveBeenCalledTimes(1);
  });

  it("falls back to settings-store toggle when layout callback is omitted", () => {
    useSettingsStore.getState().setFolderRailLayout("horizontal");

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
        layout="horizontal"
      />,
    );

    const teamButton = screen.getByRole("button", { name: "Team" });
    fireEvent.contextMenu(teamButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Display vertically" }));

    expect(useSettingsStore.getState().folderRailLayout).toBe("vertical");
  });

  it("shows 'Show system folders' and toggles settings flag from folder menu", () => {
    useSettingsStore.getState().setShowSystemFolders(false);

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Show system folders" }));

    expect(useSettingsStore.getState().showSystemFolders).toBe(true);
  });

  it("shows 'Hide system folders' when flag is enabled and toggles it off", () => {
    useSettingsStore.getState().setShowSystemFolders(true);

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide system folders" }));

    expect(useSettingsStore.getState().showSystemFolders).toBe(false);
  });

  it("selects folder on pointer click of folder icon button", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={onSelectFolder}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    await user.click(customButton!);

    expect(onSelectFolder).toHaveBeenCalledWith("custom");
  });

  it("selects folder on primary click without opening context menu", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={onSelectFolder}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    await user.click(customButton!);

    expect(onSelectFolder).toHaveBeenCalledWith("custom");
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("opens folder context menu from keyboard on focused folder icon button", async () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const folderNodes = screen.getAllByTitle("Team");
    const folderIconButton = folderNodes.find((node) => node.tagName === "BUTTON");
    expect(folderIconButton).toBeDefined();

    folderIconButton!.focus();
    fireEvent.keyDown(folderIconButton!, { key: "ContextMenu" });

    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });

  it("opens folder context menu from keyboard on focused folder label", async () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const folderTargets = screen.getAllByTitle("Team");
    const folderLabelTrigger = folderTargets.find((node) => node.tagName === "SPAN");
    expect(folderLabelTrigger).toBeDefined();

    folderLabelTrigger!.focus();
    fireEvent.keyDown(folderLabelTrigger!, { key: "F10", shiftKey: true });

    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });

  it("keeps rename and delete actions disabled for all folder", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const allNodes = screen.getAllByTitle("All");
    const allButton = allNodes.find((node) => node.tagName === "BUTTON");
    expect(allButton).toBeDefined();

    fireEvent.contextMenu(allButton!);

    const renameAction = screen.getByText("Rename");
    const renameItem = renameAction.closest("[role='menuitem']");
    expect(renameItem).toHaveAttribute("data-disabled");

    fireEvent.click(renameAction);
    expect(screen.queryByText("Rename folder")).not.toBeInTheDocument();

    fireEvent.contextMenu(allButton!);
    const deleteAction = screen.getByText("Delete");
    const deleteItem = deleteAction.closest("[role='menuitem']");
    expect(deleteItem).toHaveAttribute("data-disabled");

    fireEvent.click(deleteAction);
    expect(screen.queryByText(/Delete folder "All"\?/)).not.toBeInTheDocument();
  });

  it("keeps all-folder destructive actions disabled when all-folder is not first", () => {
    render(
      <FolderRail
        folders={[
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
          { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const allNodes = screen.getAllByTitle("All");
    const allButton = allNodes.find((node) => node.tagName === "BUTTON");
    expect(allButton).toBeDefined();

    fireEvent.contextMenu(allButton!);

    const renameAction = screen.getByText("Rename");
    const renameItem = renameAction.closest("[role='menuitem']");
    expect(renameItem).toHaveAttribute("data-disabled");

    const deleteAction = screen.getByText("Delete");
    const deleteItem = deleteAction.closest("[role='menuitem']");
    expect(deleteItem).toHaveAttribute("data-disabled");
  });

  it("keeps rename and delete disabled for personal/channels system folders", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
          {
            id: "system:personal",
            label: "Personal",
            backgroundColor: 0,
            systemType: "personal",
          },
          {
            id: "system:channels",
            label: "Channels",
            backgroundColor: 0,
            systemType: "channels",
          },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff, systemType: "created" },
        ]}
        selectedFolderId="all"
        onSelectFolder={vi.fn()}
      />,
    );

    const personalNodes = screen.getAllByTitle("Personal");
    const personalButton = personalNodes.find((node) => node.tagName === "BUTTON");
    expect(personalButton).toBeDefined();
    fireEvent.contextMenu(personalButton!);

    let renameItem = screen.getAllByRole("menuitem", { name: "Rename" }).at(-1);
    let deleteItem = screen.getAllByRole("menuitem", { name: "Delete" }).at(-1);
    expect(renameItem).toHaveAttribute("data-disabled");
    expect(deleteItem).toHaveAttribute("data-disabled");

    const channelsNodes = screen.getAllByTitle("Channels");
    const channelsButton = channelsNodes.find((node) => node.tagName === "BUTTON");
    expect(channelsButton).toBeDefined();
    fireEvent.contextMenu(channelsButton!);

    renameItem = screen.getAllByRole("menuitem", { name: "Rename" }).at(-1);
    deleteItem = screen.getAllByRole("menuitem", { name: "Delete" }).at(-1);
    expect(renameItem).toHaveAttribute("data-disabled");
    expect(deleteItem).toHaveAttribute("data-disabled");
  });

  it("opens delete confirmation as dialog for custom folder", () => {
    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);
    fireEvent.click(screen.getByText("Delete"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete folder?")).toBeInTheDocument();
    expect(screen.getByText(/delete "Team"/i)).toBeInTheDocument();
  });

  it("keeps delete dialog open when folder deletion fails", async () => {
    vi.spyOn(manageFolders, "deleteFolder").mockResolvedValue(false);

    render(
      <FolderRail
        folders={[
          { id: "all", label: "All", backgroundColor: 0xff8438 },
          { id: "custom", label: "Team", backgroundColor: 0x3a92ff },
        ]}
        selectedFolderId="custom"
        onSelectFolder={vi.fn()}
      />,
    );

    const customNodes = screen.getAllByTitle("Team");
    const customButton = customNodes.find((node) => node.tagName === "BUTTON");
    expect(customButton).toBeDefined();

    fireEvent.contextMenu(customButton!);
    fireEvent.click(screen.getByText("Delete"));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(manageFolders.deleteFolder).toHaveBeenCalledWith("custom");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
