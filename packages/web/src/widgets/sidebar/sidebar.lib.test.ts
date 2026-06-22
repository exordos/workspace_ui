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

const STREAM_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("isSidebarSystemFolderScope", () => {
  it("includes system rail ids", () => {
    expect(isSidebarSystemFolderScope(SYSTEM_ALL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_PERSONAL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_CHANNELS_FOLDER_ID)).toBe(true);
  });

  it("returns false for created folders", () => {
    expect(isSidebarSystemFolderScope("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

describe("resolveStreamRouteFromSlug", () => {
  it("keeps stream uuid as display fallback until canonical stream name is known", () => {
    const parsedStream = parseStreamSlug(STREAM_UUID);
    expect(parsedStream).not.toBeNull();

    expect(resolveStreamRouteFromSlug(parsedStream, new Map())).toEqual({
      resolvedStreamName: STREAM_UUID,
      resolvedCanonicalStreamName: null,
      resolvedStreamId: STREAM_UUID,
    });
  });

  it("prefers authoritative stream name from streamsMap over uuid route segment", () => {
    const parsedStream = parseStreamSlug(STREAM_UUID);
    expect(parsedStream).not.toBeNull();

    expect(
      resolveStreamRouteFromSlug(parsedStream, new Map([[STREAM_UUID, { name: "Test Slon" }]])),
    ).toEqual({
      resolvedStreamName: "Test Slon",
      resolvedCanonicalStreamName: "Test Slon",
      resolvedStreamId: STREAM_UUID,
    });
  });
});
