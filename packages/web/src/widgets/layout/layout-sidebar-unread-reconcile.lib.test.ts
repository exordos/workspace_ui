import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  reconcileSidebarUnreadAfterBootstrap,
  resetSidebarUnreadReconcileDedupe,
} from "./layout-sidebar-unread-reconcile.lib";

describe("reconcileSidebarUnreadAfterBootstrap", () => {
  let reconcileSpy: MockInstance;
  let fromMessagesSpy: MockInstance;

  beforeEach(() => {
    useChatListStore.getState().clear();
    resetSidebarUnreadReconcileDedupe();
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
        streams: [
          { streamId: 1, topic: "t", unreadMessageIds: ["00000000-0000-4000-8000-000000000001"] },
        ],
        dms: [],
        totalCount: 1,
        mentionMessageIds: [],
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
      messageIdToLocation: new Map([
        ["00000000-0000-4000-8000-000000000001", { type: "stream", stream_id: 1, topic: "t" }],
        ["00000000-0000-4000-8000-000000000002", { type: "stream", stream_id: 1, topic: "t2" }],
        ["00000000-0000-4000-8000-000000000003", { type: "dm", dmKey: "1,2" }],
      ]),
    });

    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: { streams: [], dms: [], totalCount: 0, mentionMessageIds: [] },
      snapshotSource: "cached-register",
    });

    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it("applies empty cached snapshot when local unread totals are zero", () => {
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: { streams: [], dms: [], totalCount: 0, mentionMessageIds: [] },
      snapshotSource: "cached-register",
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate register snapshot reconcile", () => {
    const snapshot = {
      streams: [
        { streamId: 1, topic: "t", unreadMessageIds: ["00000000-0000-4000-8000-000000000001"] },
      ],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: snapshot,
    });
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      currentUserId: 10,
      registerSnapshot: snapshot,
    });
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it("does not dedupe the same snapshot across different instances", () => {
    const snapshot = {
      streams: [
        { streamId: 1, topic: "t", unreadMessageIds: ["00000000-0000-4000-8000-000000000001"] },
      ],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };

    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      instanceId: "instance-a",
      currentUserId: 10,
      registerSnapshot: snapshot,
    });
    reconcileSidebarUnreadAfterBootstrap({
      cancelled: () => false,
      instanceId: "instance-b",
      currentUserId: 10,
      registerSnapshot: snapshot,
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(2);
  });
});
