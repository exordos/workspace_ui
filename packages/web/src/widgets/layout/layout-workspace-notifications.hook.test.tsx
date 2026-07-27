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
import type { NotificationOptions } from "~/shared/lib/notifications";
import type { shouldWorkspaceDesktopNotify } from "~/shared/lib/workspace-desktop-notifications.lib";
import { useLayoutWorkspaceNotifications } from "./layout-workspace-notifications.hook";
import { clearNotificationAggregateRegistry } from "./notification-aggregate-registry.lib";

const showNotificationMock = vi.hoisted(() =>
  vi.fn<(options: NotificationOptions) => Promise<boolean>>(() => Promise.resolve(true)),
);
const closeNotificationMock = vi.hoisted(() =>
  vi.fn<(tag: string) => Promise<void>>(() => Promise.resolve()),
);
const playNotificationSoundMock = vi.hoisted(() => vi.fn());
const requestAttentionMock = vi.hoisted(() => vi.fn());
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
    closeByTag: (...args: Parameters<typeof closeNotificationMock>) =>
      closeNotificationMock(...args),
  },
}));

vi.mock("~/shared/lib/notification-sound", () => ({
  playNotificationSound: (...args: Parameters<typeof playNotificationSoundMock>) =>
    playNotificationSoundMock(...args),
}));

vi.mock("~/shared/lib/os-integration", () => ({
  osIntegration: {
    requestAttention: (...args: Parameters<typeof requestAttentionMock>) =>
      requestAttentionMock(...args),
  },
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
  const actual = await vi.importActual<Record<string, unknown>>("./layout-notification-tags.lib");

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
    streamSnapshotsById?: MessengerBackgroundProjection["streamSnapshotsById"];
    topicSnapshotsById?: MessengerBackgroundProjection["topicSnapshotsById"];
  } = {},
): MessengerBackgroundProjection {
  return {
    ownerKey,
    lastEpochVersion: 1,
    unreadByFolderId: {},
    unreadByFolderItemId: {},
    streamSnapshotsById: options.streamSnapshotsById ?? {},
    topicSnapshotsById: options.topicSnapshotsById ?? {},
    folderSnapshotsById: {},
    folderItemSnapshotsById: {},
    folderItemTopologyById: {},
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
        clickRoute: `/topics/${ownerKeyA}/topic-1`,
        tag: expect.stringContaining(ownerKeyA),
      }),
    );
    expect(showNotificationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clickRoute: `/topics/${ownerKeyB}/topic-1`,
        tag: expect.stringContaining(ownerKeyB),
      }),
    );
    expect(resolveCachedWorkspaceUserMock).toHaveBeenCalledTimes(2);
    expect(shouldWorkspaceDesktopNotifyMock).toHaveBeenCalledTimes(2);
  });

  it("opens private and channel notifications in the topic", async () => {
    const privateSession = createSession("private");
    const channelSession = createSession("channel");
    const privateOwnerKey = workspaceRuntimeOwnerKey(privateSession);
    const channelOwnerKey = workspaceRuntimeOwnerKey(channelSession);
    const privateMessageUuid = "private-message";
    const channelMessageUuid = "channel-message";

    useWorkspaceAuthStore.setState({
      sessions: [privateSession, channelSession],
      currentAccountId: privateSession.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [privateOwnerKey]: createProjection(privateOwnerKey, {
          notificationCandidates: [createCandidate(privateOwnerKey, privateMessageUuid)],
          messageIdSnapshotsById: {
            [privateMessageUuid]: createMessageSnapshot(privateOwnerKey, privateMessageUuid),
          },
        }),
        [channelOwnerKey]: createProjection(channelOwnerKey, {
          notificationCandidates: [
            createCandidate(channelOwnerKey, channelMessageUuid, {
              audience: "channel",
              streamName: "General",
              topicName: "Bugs",
              streamNotificationMode: "all_messages",
            }),
          ],
          messageIdSnapshotsById: {
            [channelMessageUuid]: createMessageSnapshot(channelOwnerKey, channelMessageUuid),
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
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clickRoute: `/topics/${privateOwnerKey}/topic-1`,
      }),
    );
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clickRoute: `/topics/${channelOwnerKey}/topic-1`,
      }),
    );
  });

  it("keeps the conversation route when notifications are aggregated", async () => {
    const session = createSession("aggregate");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const firstMessageUuid = "aggregate-first";
    const secondMessageUuid = "aggregate-second";
    const navigate = vi.fn();

    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [
            createCandidate(ownerKey, firstMessageUuid, {
              observedAt: 1,
              messageRoute: "/message/aggregate-first",
            }),
            createCandidate(ownerKey, secondMessageUuid, {
              observedAt: 2,
              messageRoute: "/message/aggregate-second",
            }),
          ],
          messageIdSnapshotsById: {
            [firstMessageUuid]: createMessageSnapshot(ownerKey, firstMessageUuid),
            [secondMessageUuid]: createMessageSnapshot(ownerKey, secondMessageUuid, {
              observedAt: 2,
            }),
          },
        }),
      },
    });

    renderHook(() =>
      useLayoutWorkspaceNotifications({
        enabled: true,
        navigate,
      }),
    );

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledTimes(2);
    });
    expect(showNotificationMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        clickRoute: `/topics/${ownerKey}/topic-1`,
      }),
    );
    expect(showNotificationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clickRoute: `/topics/${ownerKey}/topic-1`,
      }),
    );
    const aggregatedNotification = showNotificationMock.mock.calls[1]?.[0];
    expect(aggregatedNotification).toBeDefined();
    expect(aggregatedNotification?.onClick).toEqual(expect.any(Function));

    aggregatedNotification?.onClick?.();
    expect(closeNotificationMock).toHaveBeenCalledWith(`bucket:${ownerKey}::dm:${ownerKey}`);
    expect(navigate).toHaveBeenCalledWith(`/topics/${ownerKey}/topic-1`);

    const notificationActions = {
      show: showNotificationMock,
      closeByTag: closeNotificationMock,
    };
    const actualTags = await vi.importActual<Record<string, unknown>>(
      "./layout-notification-tags.lib",
    );
    const closeReadMessageNotifications = actualTags.closeReadMessageNotifications as (
      notifications: typeof notificationActions,
      messageUuids: string[],
      ownerKey: string,
    ) => void;
    closeReadMessageNotifications(notificationActions, [secondMessageUuid], ownerKey);
    closeReadMessageNotifications(notificationActions, [firstMessageUuid], ownerKey);

    expect(showNotificationMock).toHaveBeenCalledTimes(2);
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

    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useSettingsStore.setState({ notificationSound: "glass" });
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
    expect(requestAttentionMock).toHaveBeenCalledTimes(1);
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

    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useSettingsStore.setState({ notificationSound: "none" });
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
    expect(requestAttentionMock).toHaveBeenCalledTimes(1);
  });

  it("does not show a desktop notification or play app sound when decision is notify:false", async () => {
    const session = createSession("blocked");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "blocked-message";

    shouldWorkspaceDesktopNotifyMock.mockReturnValueOnce({ notify: false, trigger: "stream" });
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useSettingsStore.setState({ notificationSound: "glass" });
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
    expect(requestAttentionMock).not.toHaveBeenCalled();
  });

  it("passes the backend notification gate to the final policy before all effects", async () => {
    const session = createSession("provider-gate");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "provider-gate-message";

    shouldWorkspaceDesktopNotifyMock.mockImplementationOnce(({ message }) => ({
      notify: message.notificationEligible !== false,
      trigger: "dm",
    }));
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useSettingsStore.setState({ notificationSound: "glass" });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [
            createCandidate(ownerKey, messageUuid, {
              notificationEligible: false,
              liveEffectPolicyReason: "provider_gate_closed",
            }),
          ],
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
      expect(shouldWorkspaceDesktopNotifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({ notificationEligible: false }),
        }),
      );
    });
    expect(showNotificationMock).not.toHaveBeenCalled();
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
    expect(requestAttentionMock).not.toHaveBeenCalled();
  });

  it("defers an unknown candidate until stream metadata can resolve the audience", async () => {
    const session = createSession("deferred");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "deferred-message";
    const deferredCandidate = createCandidate(ownerKey, messageUuid, {
      audience: "unknown",
      streamName: null,
      streamNotificationMode: null,
      topicNotificationMode: null,
    });

    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [deferredCandidate],
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

    expect(showNotificationMock).not.toHaveBeenCalled();
    expect(shouldWorkspaceDesktopNotifyMock).not.toHaveBeenCalled();

    useMessengerBackgroundProjectionStore.setState({
      projectionsByOwnerKey: {
        [ownerKey]: createProjection(ownerKey, {
          notificationCandidates: [deferredCandidate],
          messageIdSnapshotsById: {
            [messageUuid]: createMessageSnapshot(ownerKey, messageUuid),
          },
          streamSnapshotsById: {
            "stream-1": {
              ownerKey,
              streamUuid: "stream-1",
              streamName: "Direct chat",
              unreadCount: 1,
              notificationMode: "mentions_only",
              isPrivate: true,
              lastMessageUuid: messageUuid,
              isArchived: false,
              epochVersion: 1,
              updatedAt: "2026-07-07T10:00:00.000Z",
              observedAt: 2,
            },
          },
        }),
      },
    });

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledTimes(1);
    });
    expect(shouldWorkspaceDesktopNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          kind: "dm",
          streamNotificationMode: "mentions_only",
        }),
      }),
    );
  });

  it("plays app sound and requests attention even when native notification returns false", async () => {
    const session = createSession("native-false");
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const messageUuid = "native-false-message";

    showNotificationMock.mockResolvedValueOnce(false);
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useSettingsStore.setState({ notificationSound: "glass" });
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
      expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    });
    expect(requestAttentionMock).toHaveBeenCalledTimes(1);
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
  });
});
