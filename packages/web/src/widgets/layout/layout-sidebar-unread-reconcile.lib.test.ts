import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as zulip from "~/shared/api/zulip";
import { reconcileSidebarUnreadAfterBootstrap } from "./layout-sidebar-unread-reconcile.lib";

describe("reconcileSidebarUnreadAfterBootstrap", () => {
  let reconcileSpy: MockInstance;
  let fromMessagesSpy: MockInstance;
  let fetchSpy: MockInstance;

  beforeEach(() => {
    useChatListStore.getState().clear();
    reconcileSpy = vi.spyOn(useChatListStore.getState(), "reconcileUnreadFromSnapshot");
    fromMessagesSpy = vi.spyOn(useChatListStore.getState(), "reconcileUnreadFromMessages");
    fetchSpy = vi.spyOn(zulip, "fetchUnreadMessagesSnapshot");
  });

  afterEach(() => {
    reconcileSpy.mockRestore();
    fromMessagesSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("reconciles from register snapshot when usable", () => {
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: {
        streams: [{ streamId: 1, topic: "t", unreadMessageIds: [1] }],
        dms: [],
        totalCount: 1,
      },
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(fromMessagesSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fetch messages for counts when register snapshot missing", () => {
    fetchSpy.mockResolvedValue([]);

    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: null,
    });

    expect(reconcileSpy).not.toHaveBeenCalled();
    expect(fromMessagesSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
