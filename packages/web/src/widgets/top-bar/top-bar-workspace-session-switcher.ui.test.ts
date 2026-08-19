import { describe, expect, it } from "vitest";
import type {
  MessengerBackgroundMessageIdSnapshot,
  MessengerBackgroundNotificationCandidate,
  MessengerBackgroundProjection,
  MessengerBackgroundStreamSnapshot,
} from "~/entities/messenger/messenger-background-projection.model";
import { getBackgroundProjectionUnreadCount } from "./top-bar-workspace-session-unread.lib";

const OWNER_KEY = "account:a:org:o:project:p:user:u";
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";

function createCandidate(
  overrides: Partial<MessengerBackgroundNotificationCandidate> = {},
): MessengerBackgroundNotificationCandidate {
  return {
    ownerKey: OWNER_KEY,
    organizationId: "org-a",
    projectId: "project-a",
    epochVersion: 1,
    messageUuid: MESSAGE_UUID,
    streamUuid: "stream-a",
    topicUuid: "topic-a",
    authorUuid: "author-a",
    isOwn: false,
    read: false,
    createdAt: "2026-07-25T08:00:00Z",
    previewText: "Message",
    audience: "private",
    streamName: "Alice",
    topicName: null,
    messageRoute: "/message",
    streamRoute: "/stream",
    topicRoute: "/topic",
    streamConversationId: "stream:stream-a",
    topicConversationId: "topic:stream-a:topic-a",
    streamNotificationMode: "all_messages",
    topicNotificationMode: "default",
    observedAt: 1,
    ...overrides,
  };
}

function createMessageSnapshot(
  overrides: Partial<MessengerBackgroundMessageIdSnapshot> = {},
): MessengerBackgroundMessageIdSnapshot {
  return {
    ownerKey: OWNER_KEY,
    messageUuid: MESSAGE_UUID,
    streamUuid: "stream-a",
    topicUuid: "topic-a",
    authorUuid: "author-a",
    isOwn: false,
    read: false,
    epochVersion: 1,
    createdAt: "2026-07-25T08:00:00Z",
    updatedAt: "2026-07-25T08:00:00Z",
    observedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createStreamSnapshot(
  overrides: Partial<MessengerBackgroundStreamSnapshot> = {},
): MessengerBackgroundStreamSnapshot {
  return {
    ownerKey: OWNER_KEY,
    streamUuid: "stream-a",
    streamName: "Stream A",
    unreadCount: 2,
    activeUnreadCount: 2,
    passiveUnreadCount: 0,
    notificationMode: "all_messages",
    isPrivate: false,
    lastMessageUuid: MESSAGE_UUID,
    isArchived: false,
    epochVersion: 2,
    updatedAt: "2026-07-25T08:01:00Z",
    observedAt: 2,
    ...overrides,
  };
}

function createProjection(
  overrides: Partial<MessengerBackgroundProjection> = {},
): MessengerBackgroundProjection {
  return {
    ownerKey: OWNER_KEY,
    lastEpochVersion: 1,
    unreadByFolderId: {},
    unreadByFolderItemId: {},
    streamSnapshotsById: {},
    topicSnapshotsById: {},
    folderSnapshotsById: {},
    folderItemSnapshotsById: {},
    folderItemTopologyById: {},
    messageIdSnapshotsById: {},
    recentEvents: [],
    notificationCandidates: [createCandidate()],
    skippedEvents: [],
    lastTransportState: null,
    ...overrides,
  };
}

describe("getBackgroundProjectionUnreadCount", () => {
  it("uses an unread notification candidate as a legacy fallback", () => {
    expect(getBackgroundProjectionUnreadCount(createProjection())).toBe(1);
  });

  it("ignores a candidate after its current snapshot becomes read", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          messageIdSnapshotsById: {
            [MESSAGE_UUID]: createMessageSnapshot({ read: true }),
          },
        }),
      ),
    ).toBe(0);
  });

  it("ignores a candidate after its current snapshot is deleted", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          messageIdSnapshotsById: {
            [MESSAGE_UUID]: createMessageSnapshot({ deletedAt: 1 }),
          },
        }),
      ),
    ).toBe(0);
  });

  it("sums active unread from stream snapshots when folder topology is unavailable", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          streamSnapshotsById: {
            "stream-a": createStreamSnapshot(),
            "stream-b": createStreamSnapshot({
              streamUuid: "stream-b",
              unreadCount: 7,
              activeUnreadCount: 3,
              passiveUnreadCount: 4,
            }),
          },
        }),
      ),
    ).toBe(5);
  });

  it("tracks repeated unread updates for the same stream beyond the candidate fallback", () => {
    expect(
      [1, 2, 3].map((activeUnreadCount) =>
        getBackgroundProjectionUnreadCount(
          createProjection({
            streamSnapshotsById: {
              "stream-a": createStreamSnapshot({
                unreadCount: activeUnreadCount,
                activeUnreadCount,
              }),
            },
          }),
        ),
      ),
    ).toEqual([1, 2, 3]);
  });

  it("uses active rather than raw unread for muted stream traffic", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          streamSnapshotsById: {
            "stream-a": createStreamSnapshot({
              unreadCount: 8,
              activeUnreadCount: 2,
              passiveUnreadCount: 6,
            }),
          },
        }),
      ),
    ).toBe(2);
  });

  it("ignores archived streams and suppresses their stale candidates", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          streamSnapshotsById: {
            "stream-a": createStreamSnapshot({ isArchived: true, activeUnreadCount: 4 }),
          },
        }),
      ),
    ).toBe(0);
  });

  it("uses an authoritative zero stream snapshot over a stale candidate", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          streamSnapshotsById: {
            "stream-a": createStreamSnapshot({
              unreadCount: 0,
              activeUnreadCount: 0,
              passiveUnreadCount: 0,
            }),
          },
        }),
      ),
    ).toBe(0);
  });

  it("keeps a conservative candidate fallback until its stream snapshot arrives", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          streamSnapshotsById: {
            "stream-b": createStreamSnapshot({
              streamUuid: "stream-b",
              unreadCount: 0,
              activeUnreadCount: 0,
              passiveUnreadCount: 0,
            }),
          },
        }),
      ),
    ).toBe(1);
  });

  it("prefers a positive authoritative folder count over candidate state", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          unreadByFolderId: { "folder-a": 4 },
          notificationCandidates: [createCandidate({ read: true })],
        }),
      ),
    ).toBe(4);
  });

  it("uses the all folder for the organization badge without double-counting other folders", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          unreadByFolderId: {
            "00000000-0000-0000-0000-000000000000": 4,
            "00000000-0000-0000-0000-000000000002": 3,
            "custom-folder": 2,
          },
        }),
      ),
    ).toBe(4);
  });

  it("prefers an authoritative zero folder count over a stale candidate", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          unreadByFolderId: { "folder-a": 0 },
          streamSnapshotsById: {
            "stream-a": createStreamSnapshot({ activeUnreadCount: 7 }),
          },
        }),
      ),
    ).toBe(0);
  });

  it("prefers an authoritative zero folder item count over a stale candidate", () => {
    expect(
      getBackgroundProjectionUnreadCount(
        createProjection({
          unreadByFolderItemId: { "folder-item-a": 0 },
        }),
      ),
    ).toBe(0);
  });
});
