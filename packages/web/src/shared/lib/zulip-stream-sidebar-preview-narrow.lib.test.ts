import { describe, expect, it } from "vitest";
import {
  buildStreamSidebarPreviewNarrow,
  EXCLUDE_DM_NARROW_CLAUSE,
} from "./zulip-stream-sidebar-preview-narrow.lib";

describe("buildStreamSidebarPreviewNarrow", () => {
  it("excludes DMs for recent stream preview", () => {
    expect(buildStreamSidebarPreviewNarrow(false)).toEqual([EXCLUDE_DM_NARROW_CLAUSE]);
  });

  it("combines is:unread with -is:dm for unread stream preview", () => {
    expect(buildStreamSidebarPreviewNarrow(true)).toEqual([
      { operator: "is", operand: "unread" },
      EXCLUDE_DM_NARROW_CLAUSE,
    ]);
  });
});
