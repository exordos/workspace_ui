import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { reconcileSidebarUnreadAfterBootstrap } from "./layout-sidebar-unread-reconcile.lib";

describe("reconcileSidebarUnreadAfterBootstrap", () => {
  let reconcileSpy: MockInstance;
  let fromMessagesSpy: MockInstance;

  beforeEach(() => {
    useChatListStore.getState().clear();
    reconcileSpy = vi.spyOn(useChatListStore.getState(), "reconcileUnreadFromSnapshot");
    fromMessagesSpy = vi.spyOn(useChatListStore.getState(), "reconcileUnreadFromMessages");
  });

  afterEach(() => {
    reconcileSpy.mockRestore();
    fromMessagesSpy.mockRestore();
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
  });

  it("does not fetch messages for counts when register snapshot missing", () => {
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: null,
    });

    expect(reconcileSpy).not.toHaveBeenCalled();
    expect(fromMessagesSpy).not.toHaveBeenCalled();
  });

  it("skips empty cached snapshot when sidebar still has local unread totals", () => {
    useChatListStore.setState({
      sidebarStreamsUnread: 2,
      sidebarDmsUnread: 1,
    });

    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: { streams: [], dms: [], totalCount: 0 },
      snapshotSource: "cached-register",
    });

    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it("applies empty cached snapshot when local unread totals are zero", () => {
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: { streams: [], dms: [], totalCount: 0 },
      snapshotSource: "cached-register",
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it("applies empty fresh register snapshot even when local unread totals exist", () => {
    useChatListStore.setState({
      sidebarStreamsUnread: 3,
      sidebarDmsUnread: 0,
    });

    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: { streams: [], dms: [], totalCount: 0 },
      snapshotSource: "fresh-register",
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });
});
