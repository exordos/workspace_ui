import { describe, expect, it } from "vitest";
import {
  SIDEBAR_SYSTEM_ALL_FOLDER_ID,
  SIDEBAR_SYSTEM_CHANNELS_FOLDER_ID,
  SIDEBAR_SYSTEM_PERSONAL_FOLDER_ID,
} from "./sidebar-folder.constants";
import {
  isSidebarSystemFolderScope,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
  VISIBLE_MY_ACTIVITY,
} from "./sidebar.lib";

describe("VISIBLE_MY_ACTIVITY", () => {
  it("keeps only the available activity navigation items", () => {
    expect(VISIBLE_MY_ACTIVITY.map((item) => item.key)).toEqual(["inbox", "drafts", "favorites"]);
  });
});

describe("isSidebarSystemFolderScope", () => {
  it("includes system rail ids", () => {
    expect(isSidebarSystemFolderScope(SIDEBAR_SYSTEM_ALL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SIDEBAR_SYSTEM_PERSONAL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SIDEBAR_SYSTEM_CHANNELS_FOLDER_ID)).toBe(true);
  });

  it("returns false for created folders", () => {
    expect(isSidebarSystemFolderScope("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

describe("resolveStreamRouteFromSlug", () => {
  it("keeps slug name only as display fallback until canonical stream name is known", () => {
    const parsedStream = parseStreamSlug("14-test-slon");
    expect(parsedStream).not.toBeNull();

    expect(resolveStreamRouteFromSlug(parsedStream, new Map())).toEqual({
      resolvedStreamName: "test-slon",
      resolvedCanonicalStreamName: null,
      resolvedStreamId: 14,
    });
  });

  it("prefers authoritative stream name from streamsMap over lowercased slug", () => {
    const parsedStream = parseStreamSlug("14-test-slon");
    expect(parsedStream).not.toBeNull();

    expect(
      resolveStreamRouteFromSlug(parsedStream, new Map([[14, { name: "Test Slon" }]])),
    ).toEqual({
      resolvedStreamName: "Test Slon",
      resolvedCanonicalStreamName: "Test Slon",
      resolvedStreamId: 14,
    });
  });
});
