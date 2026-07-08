import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MessengerBackgroundNotificationCandidate,
  MessengerBackgroundProjection,
  MessengerBackgroundMessageIdSnapshot,
} from "~/entities/messenger/messenger-background-projection.model";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { clearNotifiedMessageIds } from "~/shared/lib/notification-dedup.lib";
import type { shouldWorkspaceDesktopNotify } from "~/shared/lib/workspace-desktop-notifications.lib";
import { useLayoutWorkspaceNotifications } from "./layout-workspace-notifications.hook";
import { clearNotificationAggregateRegistry } from "./notification-aggregate-registry.lib";

const showNotificationMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const playNotificationSoundMock = vi.hoisted(() => vi.fn());
const resolveCachedWorkspaceUserMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ displayName: "Alice" })),
);
const shouldWorkspaceDesktopNotifyMock = vi.hoisted(() =>
  vi.fn<typeof shouldWorkspaceDesktopNotify>(() => ({ notify: true, trigger: "dm" })),
);
const closeReadMessageNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/notifications", () => ({
  notificationService: {
    show: (...args: Parameters<typeof showNotificationMock>) => showNotificationMock(...args),
  },
}));

vi.mock("~/shared/lib/notification-sound", () => ({
  playNotificationSound: (...args: Parameters<typeof playNotificationSoundMock>) =>
    playNotificationSoundMock(...args),
}));

vi.mock("~/entities/user/user-sync.lib", () => ({
  resolveCachedWorkspaceUser: (...args: Parameters<typeof resolveCachedWorkspaceUserMock>) =>
    resolveCachedWorkspaceUserMock(...args),
}));

vi.mock("~/shared/lib/workspace-desktop-notifications.lib", () => ({
  shouldWorkspaceDesktopNotify: (...args: Parameters<typeof shouldWorkspaceDesktopNotifyMock>) =>
    shouldWorkspaceDesktopNotifyMock(...args),
}));

vi.mock("~/shared/lib/unexpected-error.lib", () => ({
  reportUnexpectedError: vi.fn(),
}));

vi.mock("./layout-notification-tags.lib", async () => {
  const actual = await vi.importActual<typeof import("./layout-notification-tags.lib")>(
    "./layout-notification-tags.lib",
  );

  return {
    ...actual,
    closeReadMessageNotifications: (
      ...args: Parameters<typeof closeReadMessageNotificationsMock>
    ) => closeReadMessageNotificationsMock(...args),
  };
});

function createSession(
  suffix: string,
  overrides: Partial<WorkspaceAuthSession> = {},
): WorkspaceAuthSession {
  return {
    accountId: `account-${suffix}`,
    instanceId: `instance-${suffix}`,
    organizationId: `organization-${suffix}`,
    organizationOrigin: `https://workspace-${suffix}.example.com`,
    projectId: `project-${suffix}`,
    userUuid: `user-${suffix}`,
    login: `${suffix}@example.com`,
    accessToken: `token-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    runtimeGeneration: 1,
    profile: {
      uuid: `user-${suffix}`,
      username: `user-${suffix}`,
      firstName: suffix,
      lastName: null,
      email: `${suffix}@example.com`,
    },
    ...overrides,
  };
}

function createMessageSnapshot(
  ownerKey: string,
  messageUuid: string,
  overrides: Partial<MessengerBackgroundMessageIdSnapshot> = {},
): MessengerBackgroundMessageIdSnapshot {
  return {
    ownerKey,
    messageUuid,
    streamUuid: "stream-1",
    topicUuid: "topic-1",
    authorUuid: "author-1",
    isOwn: false,
    read: false,
    epochVersion: 1,
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    observedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createCandidate(
  ownerKey: string,
  messageUuid: string,
  overrides: Partial<MessengerBackgroundNotificationCandidate> = {},
): MessengerBackgroundNotificationCandidate {
  return {
    ownerKey,
    organizationId: "organization",
    projectId: "project",
    epochVersion: 1,
    messageUuid,
    streamUuid: "stream-1",
    topicUuid: "topic-1",
    authorUuid: "author-1",
    isOwn: false,
    read: false,
    createdAt: "2026-07-07T10:00:00.000Z",
    previewText: `Preview for ${messageUuid}`,
    audience: "private",
    streamName: "Direct chat",
    topicName: null,
    messageRoute: `/messages/${ownerKey}/${messageUuid}`,
    streamRoute: `/streams/${ownerKey}/stream-1`,
    topicRoute: `/topics/${ownerKey}/topic-1`,
    streamConversationId: `dm:${ownerKey}`,
    topicConversationId: `topic:${ownerKey}`,
    streamNotificationMode: null,
    topicNotificationMode: null,
    observedAt: 1,
    ...overrides,
  };
}

function createProjection(
  ownerKey: string,
  options: {
    notificationCandidates?: MessengerBackgroundNotificationCandidate[];
    messageIdSnapshotsById?: Record<string, MessengerBackgroundMessageIdSnapshot>;
  } = {},
): MessengerBackgroundProjection {
  return {
    ownerKey,
    lastEpochVersion: 1,
    unreadByFolderId: {},
    unreadByFolderItemId: {},
    streamSnapshotsById: {},
    topicSnapshotsById: {},
    folderSnapshotsById: {},
    folderItemSnapshotsById: {},
    messageIdSnapshotsById: options.messageIdSnapshotsById ?? {},
    recentEvents: [],
    notificationCandidates: options.notificationCandidates ?? [],
    skippedEvents: [],
    lastTransportState: null,
  };
}

describe("useLayoutWorkspaceNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNotifiedMessageIds();
    clearNotificationAggregateRegistry();
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    useSettingsStore.setState({ notificationSound: "none" });
    useMessengerBackgroundProjectionStore.getState().clear();
  });

  afterEach(() => {
    clearNotifiedMessageIds();
    clearNotificationAggregateRegistry();
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    useSettingsStore.setState({ notificationSound: "none" });
    useMessengerBackgroundProjectionStore.getState().clear();
  });

  it("shows notifications for candidates from different ownerKey values", async () => {
    const sessionA = createSession("a");
    const sessionB = createSession("b");
    const ownerKeyA = workspaceRuntimeOwnerKey(sessionA);
    const ownerKeyB = workspaceRuntimeOwnerKey(sessionB);
    const sharedMessageUuid = "shared-message";

    useWorkspaceAuthStore.setState({
      sessions: [sessionA, sessionB],
      currentAccountId: sessionA.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKeyA]: createProjection(ownerKeyA, {
          notificationCandidates: [
            createCandidate(ownerKeyA, sharedMessageUuid, {
              observedAt: 1,
              messageRoute: "/messages/owner-a/shared-message",
            }),
          ],
          messageIdSnapshotsById: {
            [sharedMessageUuid]: createMessageSnapshot(ownerKeyA, sharedMessageUuid),
          },
        }),
        [ownerKeyB]: createProjection(ownerKeyB, {
          notificationCandidates: [
            createCandidate(ownerKeyB, sharedMessageUuid, {
              observedAt: 2,
              messageRoute: "/messages/owner-b/shared-message",
            }),
          ],
          messageIdSnapshotsById: {
            [sharedMessageUuid]: createMessageSnapshot(ownerKeyB, sharedMessageUuid),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledTimes(2);
    });
    expect(showNotificationMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        clickRoute: "/messages/owner-a/shared-message",
        tag: expect.stringContaining(ownerKeyA),
      }),
    );
    expect(showNotificationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clickRoute: "/messages/owner-b/shared-message",
        tag: expect.stringContaining(ownerKeyB),
      }),
    );
    expect(resolveCachedWorkspaceUserMock).toHaveBeenCalledTimes(2);
    expect(shouldWorkspaceDesktopNotifyMock).toHaveBeenCalledTimes(2);
  });

  it("closes read notifications only for the matching ownerKey", async () => {
    const sessionA = createSession("a");
    const sessionB = createSession("b");
    const ownerKeyA = workspaceRuntimeOwnerKey(sessionA);
    const ownerKeyB = workspaceRuntimeOwnerKey(sessionB);
    const sharedMessageUuid = "shared-message";

    useWorkspaceAuthStore.setState({
      sessions: [sessionA, sessionB],
      currentAccountId: sessionA.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKeyA]: createProjection(ownerKeyA, {
          messageIdSnapshotsById: {
            [sharedMessageUuid]: createMessageSnapshot(ownerKeyA, sharedMessageUuid, {
              read: true,
            }),
          },
        }),
        [ownerKeyB]: createProjection(ownerKeyB, {
          messageIdSnapshotsById: {
            [sharedMessageUuid]: createMessageSnapshot(ownerKeyB, sharedMessageUuid, {
              read: false,
            }),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(closeReadMessageNotificationsMock).toHaveBeenCalledTimes(1);
    });
    expect(closeReadMessageNotificationsMock).toHaveBeenCalledWith(
      expect.any(Object),
      [sharedMessageUuid],
      ownerKeyA,
    );
    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("plays the selected app sound when desktop notification decision is notify:true", async () => {
    const session = createSession("sound");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "sound-message";

    useSettingsStore.setState({ notificationSound: "glass" });
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [createCandidate(ownerKey, messageUuid)],
          messageIdSnapshotsById: {
            [messageUuid]: createMessageSnapshot(ownerKey, messageUuid),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledTimes(1);
    });
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    expect(playNotificationSoundMock).toHaveBeenCalledWith("glass");
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        silent: true,
      }),
    );
  });

  it('keeps the desktop notification silent and skips app sound when notificationSound is "none"', async () => {
    const session = createSession("silent");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "silent-message";

    useSettingsStore.setState({ notificationSound: "none" });
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [createCandidate(ownerKey, messageUuid)],
          messageIdSnapshotsById: {
            [messageUuid]: createMessageSnapshot(ownerKey, messageUuid),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledTimes(1);
    });
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        silent: true,
      }),
    );
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });

  it("does not show a desktop notification or play app sound when decision is notify:false", async () => {
    const session = createSession("blocked");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "blocked-message";

    shouldWorkspaceDesktopNotifyMock.mockReturnValueOnce({ notify: false, trigger: "stream" });
    useSettingsStore.setState({ notificationSound: "glass" });
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [createCandidate(ownerKey, messageUuid)],
          messageIdSnapshotsById: {
            [messageUuid]: createMessageSnapshot(ownerKey, messageUuid),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(shouldWorkspaceDesktopNotifyMock).toHaveBeenCalledTimes(1);
    });
    expect(showNotificationMock).not.toHaveBeenCalled();
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });
});
