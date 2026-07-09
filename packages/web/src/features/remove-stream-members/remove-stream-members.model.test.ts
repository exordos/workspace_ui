// Tests for remove-stream-members store.
// Covers pending/error state for the unsupported legacy numeric submit flow.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoveStreamMembersStore } from "./remove-stream-members.model";

describe("useRemoveStreamMembersStore", () => {
  beforeEach(() => {
    useRemoveStreamMembersStore.getState().clear();
    vi.clearAllMocks();
  });

  it("returns unsupported for legacy numeric remove and keeps success callback untouched", async () => {
    const onSuccess = vi.fn();
    const result = await useRemoveStreamMembersStore.getState().submit({
      streamId: 10,
      streamName: "engineering",
      userId: 88,
      onSuccess,
    });

    expect(result).toMatchObject({ ok: false, errorCode: "unsupported" });
    expect(useRemoveStreamMembersStore.getState().pendingUserIds).toEqual([]);
    expect(useRemoveStreamMembersStore.getState().lastError).toBe("app.error");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("stores per-user error when request fails", async () => {
    const result = await useRemoveStreamMembersStore.getState().submit({
      streamId: 10,
      streamName: "engineering",
      userId: 88,
    });

    expect(result?.ok).toBe(false);
    expect(useRemoveStreamMembersStore.getState().pendingUserIds).toEqual([]);
    expect(useRemoveStreamMembersStore.getState().lastError).toBe("app.error");
    expect(useRemoveStreamMembersStore.getState().errorByUserId[88]).toBe("app.error");
  });
});
