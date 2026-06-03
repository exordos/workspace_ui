// Tests for remove-stream-members store.
// Covers pending/error state and successful member removal submit flow.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeStreamMembers } from "./remove-stream-members.api";
import { useRemoveStreamMembersStore } from "./remove-stream-members.model";

vi.mock("./remove-stream-members.api", () => ({
  removeStreamMembers: vi.fn(),
}));

describe("useRemoveStreamMembersStore", () => {
  beforeEach(() => {
    useRemoveStreamMembersStore.getState().clear();
    vi.clearAllMocks();
  });

  it("submits remove request and clears pending on success", async () => {
    vi.mocked(removeStreamMembers).mockResolvedValue({
      ok: true,
      removedUserIds: [88],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    const onSuccess = vi.fn();
    const result = await useRemoveStreamMembersStore.getState().submit({
      streamId: 10,
      streamName: "engineering",
      userId: 88,
      onSuccess,
    });

    expect(removeStreamMembers).toHaveBeenCalledWith({
      streamName: "engineering",
      userIds: [88],
    });
    expect(result?.ok).toBe(true);
    expect(useRemoveStreamMembersStore.getState().pendingUserIds).toEqual([]);
    expect(useRemoveStreamMembersStore.getState().lastError).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith(10);
  });

  it("stores per-user error when request fails", async () => {
    vi.mocked(removeStreamMembers).mockResolvedValue({
      ok: false,
      removedUserIds: [],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "http_403",
    });

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
