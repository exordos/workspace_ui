import { describe, expect, it } from "vitest";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import {
  isSidebarSystemFolderScope,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
} from "./sidebar.lib";

describe("isSidebarSystemFolderScope", () => {
  it("includes system rail ids and legacy «all»", () => {
    expect(isSidebarSystemFolderScope(SYSTEM_ALL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_PERSONAL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_CHANNELS_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope("all")).toBe(true);
  });

  it("returns false for created folders", () => {
    expect(isSidebarSystemFolderScope("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

describe("resolveStreamRouteFromSlug", () => {
  it("keeps slug name only as display fallback until canonical stream name is known", () => {
    const parsedStream = parseStreamSlug("14-test-slon");

    expect(resolveStreamRouteFromSlug(parsedStream, new Map())).toEqual({
      resolvedStreamName: "test-slon",
      resolvedCanonicalStreamName: null,
      resolvedStreamId: 14,
    });
  });

  it("prefers authoritative stream name from streamsMap over lowercased slug", () => {
    const parsedStream = parseStreamSlug("14-test-slon");

    expect(
      resolveStreamRouteFromSlug(parsedStream, new Map([[14, { name: "Test Slon" }]])),
    ).toEqual({
      resolvedStreamName: "Test Slon",
      resolvedCanonicalStreamName: "Test Slon",
      resolvedStreamId: 14,
    });
  });
});
