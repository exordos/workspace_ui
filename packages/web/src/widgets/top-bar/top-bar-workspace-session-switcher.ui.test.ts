import { describe, expect, it } from "vitest";
import type {
  MessengerBackgroundMessageIdSnapshot,
  MessengerBackgroundNotificationCandidate,
  MessengerBackgroundProjection,
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
