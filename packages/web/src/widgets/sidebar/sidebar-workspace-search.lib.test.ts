import { describe, expect, it } from "vitest";
import type {
  MessengerFolder,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import { normalizeSidebarSearchQuery } from "./sidebar-filtering.lib";
import { projectWorkspaceSidebarSearch } from "./sidebar-workspace-search.lib";

function topic(title: string, topicUuid: string): MessengerSidebarTopicItem {
  return {
    id: `topic:stream-a:${topicUuid}`,
    streamUuid: "stream-a",
    topicUuid,
    title,
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    color: null,
    route: `/stream/stream-a/topic/${topicUuid}`,
    preview: null,
    lastMessageCreatedAt: null,
    updatedAt: "2026-08-26T10:00:00Z",
  };
}

function stream(
  streamUuid: string,
  title: string,
  topics: MessengerSidebarTopicItem[] = [],
): MessengerSidebarStreamItem {
  return {
    id: `stream:${streamUuid}`,
    streamUuid,
    directUserUuid: null,
    title,
    audience: "channel",
    isPrivate: false,
    isArchived: false,
    uiKind: "channel",
    notificationMode: "mentions_only",
    unreadCount: 0,
    pinnedAt: null,
    orderIndex: null,
    route: `/stream/${streamUuid}`,
    topics: topics.map((item) => ({ ...item, streamUuid })),
    preview: null,
    updatedAt: "2026-08-26T10:00:00Z",
    lastMessageCreatedAt: null,
  };
}

const LOCAL_SEARCH_FOLDER_CASES: readonly [string, MessengerFolder["systemType"]][] = [
  ["Personal", "personal"],
  ["Channels", "channels"],
  ["custom", null],
  ["backend-created custom", "created"],
];

describe("projectWorkspaceSidebarSearch", () => {
  it.each(["петров", "иван петров", "ivan_dev", "ivan@example.test"])(
    "finds direct chats by profile fields in local and global results: %s",
    (query) => {
      const direct = {
        ...stream("direct-a", "Ваня"),
        uiKind: "directPrivate" as const,
        directUserUuid: "ivan",
        directUserSearchText: "Ваня\nИван Петров\nivan_dev\nivan@example.test",
      };
      const global = { ...direct, id: "stream:direct-b", streamUuid: "direct-b" };
      const result = projectWorkspaceSidebarSearch({
        localStreams: [direct],
        allStreams: [direct, global],
        normalizedQuery: normalizeSidebarSearchQuery(`  ${query.toUpperCase()}  `),
        selectedFolderSystemType: "personal",
      });

      expect(result.localStreams).toEqual([direct]);
      expect(result.globalStreams).toEqual([global]);
    },
  );

  it("keeps a direct chat searchable by title when its user profile is unavailable", () => {
    const direct = {
      ...stream("direct-a", "Иван Петров"),
      uiKind: "directPrivate" as const,
      directUserUuid: "ivan",
    };
    const search = (normalizedQuery: string) =>
      projectWorkspaceSidebarSearch({
        localStreams: [],
        allStreams: [direct],
        normalizedQuery,
        selectedFolderSystemType: "all",
      });

    expect(search("петров").globalStreams).toEqual([direct]);
    expect(search("ivan_dev").globalStreams).toEqual([]);
  });

  it("does not search user profile fields on group streams", () => {
    const group = {
      ...stream("group-a", "Engineering", [topic("Release", "topic-a")]),
      directUserSearchText: "ivan_dev\nivan@example.test",
    };
    const result = projectWorkspaceSidebarSearch({
      localStreams: [group],
      allStreams: [group],
      normalizedQuery: "ivan_dev",
      selectedFolderSystemType: "all",
    });

    expect(result.globalStreams).toEqual([]);
  });

  it("keeps local and global sections ordered while removing local duplicates", () => {
    const local = stream("stream-a", "Engineering", [topic("Release plan", "topic-a")]);
    const global = stream("stream-b", "Product release");

    const result = projectWorkspaceSidebarSearch({
      localStreams: [local],
      allStreams: [local, global],
      normalizedQuery: "release",
      selectedFolderSystemType: null,
    });

    expect(result.localStreams.map((item) => item.streamUuid)).toEqual(["stream-a"]);
    expect(result.localStreams[0]?.topics.map((item) => item.title)).toEqual(["Release plan"]);
    expect(result.globalStreams.map((item) => item.streamUuid)).toEqual(["stream-b"]);
  });

  it("keeps every topic on a stream that matches by topic so search can reveal the rest", () => {
    const local = stream("stream-a", "Engineering", [
      topic("Release plan", "topic-a"),
      topic("Unrelated", "topic-b"),
    ]);

    const result = projectWorkspaceSidebarSearch({
      localStreams: [local],
      allStreams: [local],
      normalizedQuery: "RELEASE".toLowerCase(),
      selectedFolderSystemType: null,
    });

    expect(result.localStreams[0]).toBe(local);
  });

  it("keeps every topic when only the stream title matches", () => {
    const local = stream("stream-a", "Engineering", [
      topic("General", "topic-a"),
      topic("Support", "topic-b"),
    ]);

    const result = projectWorkspaceSidebarSearch({
      localStreams: [local],
      allStreams: [local],
      normalizedQuery: "engineering",
      selectedFolderSystemType: null,
    });

    expect(result.localStreams[0]).toBe(local);
  });

  it("returns an explicit local miss shape when only global results match", () => {
    const local = stream("stream-a", "Engineering");
    const global = stream("stream-b", "Product");

    const result = projectWorkspaceSidebarSearch({
      localStreams: [local],
      allStreams: [local, global],
      normalizedQuery: "product",
      selectedFolderSystemType: null,
    });

    expect(result.localStreams).toEqual([]);
    expect(result.globalStreams).toEqual([global]);
  });

  it("uses one global section for the All folder", () => {
    const matching = stream("stream-a", "Engineering");

    const result = projectWorkspaceSidebarSearch({
      localStreams: [matching],
      allStreams: [matching],
      normalizedQuery: "engineering",
      selectedFolderSystemType: "all",
    });

    expect(result.localStreams).toEqual([]);
    expect(result.globalStreams).toEqual([matching]);
  });

  it("leaves normal-mode data untouched for a whitespace query", () => {
    const local = stream("stream-a", "Engineering", [topic("Release plan", "topic-a")]);
    const localStreams = [local];
    const normalizedQuery = normalizeSidebarSearchQuery("  \n\t ");

    const result = projectWorkspaceSidebarSearch({
      localStreams,
      allStreams: [local],
      normalizedQuery,
      selectedFolderSystemType: null,
    });

    expect(normalizedQuery).toBe("");
    expect(result.localStreams).toBe(localStreams);
    expect(result.localStreams[0]).toBe(local);
  });

  it.each(LOCAL_SEARCH_FOLDER_CASES)(
    "uses local and global sections for the %s folder",
    (_label, selectedFolderSystemType) => {
      const local = stream("stream-a", "Release planning");
      const global = stream("stream-b", "Release operations");

      const result = projectWorkspaceSidebarSearch({
        localStreams: [local],
        allStreams: [local, global],
        normalizedQuery: "release",
        selectedFolderSystemType,
      });

      expect(result.localStreams).toEqual([local]);
      expect(result.globalStreams).toEqual([global]);
    },
  );
});
