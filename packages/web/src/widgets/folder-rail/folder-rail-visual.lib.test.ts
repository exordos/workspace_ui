import { describe, expect, it } from "vitest";
import {
  folderColorValueToCssHex,
  folderColorValueToCssRgba,
} from "~/features/manage-folders/folder-colors";
import { buildFolderItemVisualState } from "./folder-rail-visual.lib";

describe("buildFolderItemVisualState", () => {
  it("applies neutral surface classes for hovered system folder", () => {
    const state = buildFolderItemVisualState({
      folder: { id: "all", label: "All", backgroundColor: 0xff8438, systemType: "all" },
      index: 0,
      isSelected: false,
      isHovered: true,
    });

    expect(state.folderSurfaceClassName).toBe("bg-sidebar-hover border-border-subtle");
    expect(state.folderSurfaceStyle).toBeUndefined();
  });

  it("does not apply surface classes for selected system folder", () => {
    const state = buildFolderItemVisualState({
      folder: {
        id: "channels",
        label: "Channels",
        backgroundColor: 0xff8438,
        systemType: "channels",
      },
      index: 1,
      isSelected: true,
      isHovered: false,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toBeUndefined();
  });

  it("does not apply surface classes when selected system folder is also hovered", () => {
    const state = buildFolderItemVisualState({
      folder: {
        id: "personal",
        label: "Personal",
        backgroundColor: 0xff8438,
        systemType: "personal",
      },
      index: 2,
      isSelected: true,
      isHovered: true,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toBeUndefined();
  });

  it("does not set surface class for idle system folder", () => {
    const state = buildFolderItemVisualState({
      folder: {
        id: "personal",
        label: "Personal",
        backgroundColor: 0xff8438,
        systemType: "personal",
      },
      index: 2,
      isSelected: false,
      isHovered: false,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toBeUndefined();
  });

  it("keeps colored inline surface for hovered custom folders", () => {
    const customColor = 0x3a92ff;
    const state = buildFolderItemVisualState({
      folder: {
        id: "custom",
        label: "Team",
        backgroundColor: customColor,
        systemType: "created",
      },
      index: 3,
      isSelected: false,
      isHovered: true,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toEqual({
      backgroundColor: folderColorValueToCssRgba(customColor, 0.1),
      borderColor: folderColorValueToCssRgba(customColor, 0.22),
    });
    expect(state.folderColor).toBe(folderColorValueToCssHex(customColor));
  });

  it("does not apply surface for selected custom folders", () => {
    const customColor = 0x3a92ff;
    const state = buildFolderItemVisualState({
      folder: {
        id: "custom",
        label: "Team",
        backgroundColor: customColor,
        systemType: "created",
      },
      index: 3,
      isSelected: true,
      isHovered: false,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toBeUndefined();
  });

  it("does not apply surface when selected custom folder is also hovered", () => {
    const customColor = 0x3a92ff;
    const state = buildFolderItemVisualState({
      folder: {
        id: "custom",
        label: "Team",
        backgroundColor: customColor,
        systemType: "created",
      },
      index: 3,
      isSelected: true,
      isHovered: true,
    });

    expect(state.folderSurfaceClassName).toBeUndefined();
    expect(state.folderSurfaceStyle).toBeUndefined();
  });
});
