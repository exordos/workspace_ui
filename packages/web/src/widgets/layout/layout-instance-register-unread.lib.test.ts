import { describe, expect, it } from "vitest";
import {
  isRegisterUnreadSnapshotEmpty,
  shouldPreserveLocalUnreadOnCachedReconcile,
} from "./layout-instance-register-unread.lib";

describe("layout-instance-register-unread", () => {
  it("isRegisterUnreadSnapshotEmpty is false when buckets have ids", () => {
    expect(
      isRegisterUnreadSnapshotEmpty({
        streams: [{ streamId: 1, topic: "t", unreadMessageIds: [1] }],
        dms: [],
        totalCount: 0,
      }),
    ).toBe(false);
  });

  it("shouldPreserveLocalUnreadOnCachedReconcile when empty cache and local badges", () => {
    expect(
      shouldPreserveLocalUnreadOnCachedReconcile({ streams: [], dms: [], totalCount: 0 }, 2, 0),
    ).toBe(true);
  });
});
