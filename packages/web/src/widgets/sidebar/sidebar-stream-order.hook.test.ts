import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  selectMessengerSidebarStreams,
  type MessengerSidebarSortMode,
} from "~/entities/messenger/messenger-sidebar.lib";
import type {
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
} from "~/entities/messenger/messenger.types";
import { useSidebarStreamOrder } from "./sidebar-stream-order.hook";

const time = (hour: number) => `2026-10-21T${hour.toString().padStart(2, "0")}:00:00Z`;

function stream(uuid: string, lastMessageUuid: string): MessengerStream {
  return {
    uuid,
    lastMessageUuid,
    projectId: "project",
    ownerUuid: "user",
    userUuid: "user",
    role: "owner",
    notificationMode: "all_messages",
    name: uuid,
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    createdAt: time(8),
    updatedAt: time(8),
  };
}

function topic(uuid: string, streamUuid: string, lastMessageUuid: string): MessengerTopic {
  return {
    uuid,
    streamUuid,
    lastMessageUuid,
    projectId: "project",
    userUuid: "user",
    name: uuid,
    unreadCount: 0,
    activeUnreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    createdAt: time(8),
    updatedAt: time(8),
  };
}

function message(
  uuid: string,
  topicUuid: string,
  hour: number,
  streamUuid = "a",
): MessengerMessage {
  return {
    uuid,
    topicUuid,
    streamUuid,
    conversationId: `topic:${streamUuid}:${topicUuid}`,
    projectId: "project",
    authorUuid: "user",
    userUuid: "user",
    payload: { kind: "markdown", content: "Synthetic message" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: time(hour),
    updatedAt: time(hour),
  };
}

function fixture(sortMode: MessengerSidebarSortMode = "last_message") {
  return {
    listKey: "owner:folder:chats",
    sortMode,
    streamsById: { a: stream("a", "a13"), b: stream("b", "b12") },
    topicsById: {
      latest: { ...topic("latest", "a", "a13"), unreadCount: 1, activeUnreadCount: 1 },
      older: topic("older", "a", "a10"),
      peer: topic("peer", "b", "b12"),
    },
    messagesById: {
      a13: message("a13", "latest", 13),
      a10: message("a10", "older", 10),
      b12: message("b12", "peer", 12, "b"),
    } as Record<string, MessengerMessage>,
  };
}

type Fixture = ReturnType<typeof fixture>;

function project(input: Fixture) {
  return {
    ...input,
    streams: selectMessengerSidebarStreams(
      {
        streamIds: ["a", "b"],
        topicIds: Object.keys(input.topicsById),
        streamsById: input.streamsById,
        topicsById: input.topicsById,
        foldersById: {},
        conversationsById: {},
      },
      {
        organizationId: "org",
        projectId: "project",
        messagesById: input.messagesById,
        sortMode: input.sortMode,
      },
    ),
  };
}

function complete(input: Fixture, topicUuid: "latest" | "older" = "latest"): Fixture {
  return {
    ...input,
    topicsById: {
      ...input.topicsById,
      [topicUuid]: { ...input.topicsById[topicUuid], isDone: true },
    },
  };
}

function order(streams: ReturnType<typeof useSidebarStreamOrder>) {
  return streams.map((row) => row.streamUuid);
}

describe("useSidebarStreamOrder", () => {
  it.each(["last_message", "unread_first"] as const)(
    "holds completion order in %s while exposing fresh status, activity and counters",
    (sortMode) => {
      const initial = fixture(sortMode);
      const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
      const done = complete(initial);
      done.topicsById.latest = { ...done.topicsById.latest, unreadCount: 0, activeUnreadCount: 0 };
      const canonical = project(done);
      expect(order(canonical.streams)).toEqual(["b", "a"]);
      view.rerender(canonical);
      expect(order(view.result.current)).toEqual(["a", "b"]);
      expect(view.result.current[0]?.lastMessageCreatedAt).toBe(time(10));
      expect(
        view.result.current[0]?.topics.find((item) => item.topicUuid === "latest"),
      ).toMatchObject({ isDone: true, unreadCount: 0 });
      // The HTTP response and realtime echo may carry identical but newly allocated snapshots.
      view.rerender(
        project({
          ...done,
          topicsById: { ...done.topicsById, latest: { ...done.topicsById.latest } },
        }),
      );
      expect(order(view.result.current)).toEqual(["a", "b"]);
      expect(initial.topicsById.latest.isDone).toBe(false);
    },
  );

  it("keeps the original activity when several topics are completed in succession", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    view.rerender(project(complete(initial)));
    view.rerender(project(complete(complete(initial), "older")));
    expect(order(view.result.current)).toEqual(["a", "b"]);
  });

  it("preserves displayed order on equal activity across completion and repeated snapshots", () => {
    const initial = fixture();
    initial.messagesById.b12 = message("b12", "peer", 13, "b");
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    expect(order(view.result.current)).toEqual(["a", "b"]);
    const done = complete(initial);
    view.rerender(project(done));
    expect(order(view.result.current)).toEqual(["a", "b"]);
    view.rerender(project({ ...done, topicsById: { ...done.topicsById } }));
    expect(order(view.result.current)).toEqual(["a", "b"]);
    view.rerender(
      project({
        ...done,
        topicsById: { ...done.topicsById, peer: { ...done.topicsById.peer, isDone: true } },
      }),
    );
    expect(order(view.result.current)).toEqual(["a", "b"]);
  });

  it("does not treat hydration or older replacement pointers as a new message", () => {
    const initial = fixture();
    const loaded = { a13: message("a13", "latest", 13), b12: message("b12", "peer", 12, "b") };
    const view = renderHook(useSidebarStreamOrder, {
      initialProps: project({ ...initial, messagesById: loaded }),
    });
    const done = complete(initial);
    view.rerender(project({ ...done, messagesById: loaded }));
    view.rerender(project(done));
    expect(order(view.result.current)).toEqual(["a", "b"]);
    view.rerender(
      project({
        ...done,
        topicsById: {
          ...done.topicsById,
          older: { ...done.topicsById.older, lastMessageUuid: "historical" },
        },
        messagesById: { ...done.messagesById, historical: message("historical", "older", 9) },
      }),
    );
    expect(order(view.result.current)).toEqual(["a", "b"]);
  });

  it.each(["done", "muted"] as const)("ignores new messages in a %s topic", (kind) => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    const topicUuid = kind === "done" ? "latest" : "older";
    view.rerender(
      project({
        ...done,
        topicsById: {
          ...done.topicsById,
          [topicUuid]: {
            ...done.topicsById[topicUuid],
            lastMessageUuid: "inactive",
            notificationMode: kind === "muted" ? "mute" : "default",
          },
        },
        messagesById: { ...done.messagesById, inactive: message("inactive", topicUuid, 14) },
      }),
    );
    expect(order(view.result.current)).toEqual(["a", "b"]);
  });

  it("does not treat re-enabling notifications as new active message delivery", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    const muted: Fixture = {
      ...done,
      topicsById: {
        ...done.topicsById,
        older: { ...done.topicsById.older, lastMessageUuid: "muted-new", notificationMode: "mute" },
      },
      messagesById: { ...done.messagesById, "muted-new": message("muted-new", "older", 14) },
    };
    view.rerender(project(muted));
    view.rerender(
      project({
        ...muted,
        topicsById: {
          ...muted.topicsById,
          older: { ...muted.topicsById.older, notificationMode: "default" },
        },
      }),
    );
    view.rerender(project(muted));
    expect(order(view.result.current)).toEqual(["a", "b"]);
  });

  it("releases on a new active message once its body arrives, then sorts normally", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    const pending = {
      ...done,
      topicsById: {
        ...done.topicsById,
        older: { ...done.topicsById.older, lastMessageUuid: "new" },
      },
    };
    view.rerender(project(pending));
    expect(order(view.result.current)).toEqual(["a", "b"]);
    const active = {
      ...pending,
      messagesById: { ...pending.messagesById, new: message("new", "older", 14) },
    };
    const canonical = project(active);
    view.rerender(canonical);
    expect(view.result.current).toBe(canonical.streams);
    view.rerender(
      project({
        ...active,
        topicsById: {
          ...active.topicsById,
          older: { ...active.topicsById.older, notificationMode: "mute" },
        },
      }),
    );
    expect(order(view.result.current)).toEqual(["b", "a"]);
  });

  it("lets other streams rise on real activity and respects explicit pinning", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    view.rerender(
      project({
        ...done,
        streamsById: {
          ...done.streamsById,
          b: { ...done.streamsById.b, lastMessageUuid: "peer-new" },
        },
        messagesById: { ...done.messagesById, "peer-new": message("peer-new", "peer", 14, "b") },
      }),
    );
    expect(order(view.result.current)).toEqual(["b", "a"]);
    const pinned = project(done);
    pinned.streams = pinned.streams.map((row) =>
      row.streamUuid === "b" ? { ...row, pinnedAt: time(8) } : row,
    );
    view.rerender(pinned);
    expect(order(view.result.current)).toEqual(["b", "a"]);
  });

  it("resets on list scope changes without restoring the hold on return", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    expect(order(view.result.current)).toEqual(["a", "b"]);
    view.rerender(project({ ...done, listKey: "another-list" }));
    expect(order(view.result.current)).toEqual(["b", "a"]);
    view.rerender(project(done));
    expect(order(view.result.current)).toEqual(["b", "a"]);
  });

  it("does not hold already completed topics on initial load or remount", () => {
    const done = project(complete(fixture()));
    const view = renderHook(useSidebarStreamOrder, { initialProps: done });
    expect(view.result.current).toBe(done.streams);
    view.unmount();
    const remounted = renderHook(useSidebarStreamOrder, { initialProps: done });
    expect(remounted.result.current).toBe(done.streams);
  });

  it("drops the hold when completion is undone or the stream is removed", () => {
    const initial = fixture();
    const view = renderHook(useSidebarStreamOrder, { initialProps: project(initial) });
    const done = complete(initial);
    view.rerender(project(done));
    const undone = project(initial);
    view.rerender(undone);
    expect(view.result.current).toBe(undone.streams);
    view.rerender(project(done));
    const removed = project(done);
    removed.streams = removed.streams.filter((row) => row.streamUuid !== "a");
    view.rerender(removed);
    expect(order(view.result.current)).toEqual(["b"]);
    const restored = project(done);
    view.rerender(restored);
    expect(view.result.current).toBe(restored.streams);
  });
});
