import { describe, expect, it, vi } from "vitest";
import {
  persistUsersDirectoryToIndexedDb,
  serializeDirectoryMembersForSnapshot,
  shouldPersistUsersDirectorySnapshot,
} from "~/entities/user/user-directory-snapshot-persist.lib";
import type { ZulipUserMember } from "~/shared/api/zulip.types";
import * as usersDirectoryDb from "~/shared/lib/users-directory-snapshot-db";

describe("shouldPersistUsersDirectorySnapshot", () => {
  it("returns false for empty list to avoid wiping IndexedDB cache", () => {
    expect(shouldPersistUsersDirectorySnapshot([])).toBe(false);
  });

  it("returns true when at least one member", () => {
    expect(shouldPersistUsersDirectorySnapshot([{ user_id: 1 }])).toBe(true);
  });
});

describe("serializeDirectoryMembersForSnapshot", () => {
  it("drops entries without user_id", () => {
    const input = [{ user_id: 1, full_name: "A" }, { full_name: "orphan" } as ZulipUserMember];
    expect(serializeDirectoryMembersForSnapshot(input)).toEqual([{ user_id: 1, full_name: "A" }]);
  });

  it("normalizes avatar_url null to undefined", () => {
    const out = serializeDirectoryMembersForSnapshot([
      { user_id: 2, full_name: "B", avatar_url: null },
    ]);
    expect(out[0]).toEqual({ user_id: 2, full_name: "B", avatar_url: undefined });
  });
});

describe("persistUsersDirectoryToIndexedDb", () => {
  it("does not call IDB when members empty", async () => {
    const spy = vi.spyOn(usersDirectoryDb, "persistUsersDirectoryRow").mockResolvedValue(undefined);
    await persistUsersDirectoryToIndexedDb("inst", []);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
