import { useEffect, useRef } from "react";
import { readChatsForOwner } from "~/applications/messenger/model/chats/chats";
import { resolveWorkspaceConversationMetadata } from "~/applications/messenger/model/chats/messenger-conversation-metadata.lib";
import type { WorkspaceConversationMetadata } from "~/applications/messenger/model/chats/messenger-conversation-metadata.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "~/applications/messenger/model/messenger-ids.lib";
import type {
  MessengerStream,
  MessengerTopic,
} from "~/applications/messenger/model/messenger.types";
import type {
  MessengerBackgroundProjection,
  MessengerBackgroundNotificationCandidate,
} from "~/applications/messenger/runtime/sync/messenger-background-projection.model";
import { getDockBounceEnabledForOwner, useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { resolveCachedWorkspaceUser } from "~/modules/users/users-runtime";
import { osIntegration } from "~/platform/desktop/os-integration";
import { notificationService } from "~/platform/notifications/notifications";
import { isElectronDarwin } from "~/shared/lib/electron";
import { createLogger } from "~/shared/lib/logger";
import {
  registerNotifiedWorkspaceMessage,
  wasWorkspaceMessageRecentlyNotified,
} from "~/shared/lib/notification-dedup.lib";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { getActivityState } from "~/shared/lib/visibility";
import { shouldWorkspaceDesktopNotify } from "~/shared/lib/workspace-desktop-notifications.lib";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import {
  formatNotificationTitle,
  type NotificationTitleContext,
} from "./layout-notification-title.lib";
import {
  consumeNotificationAggregateByTag,
  upsertNotificationAggregate,
} from "./notification-aggregate-registry.lib";
import type { NavigateFunction } from "react-router-dom";

const DEFAULT_NOTIFICATION_SENDER = "New message";
/** Give conversation metadata time to arrive before showing a generic notification. */
const NOTIFICATION_METADATA_GRACE_MS = 30_000;
const NOTIFICATION_METADATA_RETRY_MS = 250;
const notificationLog = createLogger("layout:notification");

function trimNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** The conversation open in front of the user, or null when the route is not one. */
function readOpenConversationId(pathname: string): string | null {
  const selection = selectMessengerConversationFromWorkspaceRoute(
    parseWorkspaceMessengerRoute(pathname),
  );
  return selection.status === "conversation" ? selection.conversationId : null;
}

function readViewportState(
  candidate: MessengerBackgroundNotificationCandidate,
  openConversationId: string | null,
): { windowFocused: boolean; isConversationOnScreen: boolean } {
  const isConversationOnScreen =
    openConversationId != null &&
    (openConversationId === candidate.topicConversationId ||
      openConversationId === candidate.streamConversationId);

  return {
    // getActivityState() rather than document.hasFocus(): the latter depends on the
    // window manager cooperating, and in Electron the main process is the authority.
    windowFocused: getActivityState() === "active",
    isConversationOnScreen,
  };
}

function buildCandidateScopeKey(ownerKey: string, messageUuid: string): string {
  return `${ownerKey}::${messageUuid}`;
}

function markCandidateProcessed(
  processedCandidates: Set<string>,
  ownerKey: string,
  messageUuid: string,
): void {
  processedCandidates.add(buildCandidateScopeKey(ownerKey, messageUuid));
}

function resolveCurrentCandidate(
  projection: MessengerBackgroundProjection,
  candidate: MessengerBackgroundNotificationCandidate,
  activeMetadata?: {
    ownerKey: string | null;
    streamsById: Readonly<Record<string, MessengerStream>>;
    topicsById: Readonly<Record<string, MessengerTopic>>;
  },
  // The cached catalog is the last source: it is the only one that knows a
  // conversation of an owner whose messenger store is not the one on screen.
  cachedMetadata?: WorkspaceConversationMetadata | null,
): {
  candidate: MessengerBackgroundNotificationCandidate;
  missingMetadata: string[];
} {
  const streamSnapshot = projection.streamSnapshotsById[candidate.streamUuid];
  const topicSnapshot = projection.topicSnapshotsById[candidate.topicUuid];
  const activeStream =
    activeMetadata?.ownerKey === candidate.ownerKey
      ? activeMetadata.streamsById[candidate.streamUuid]
      : undefined;
  const activeTopic =
    activeMetadata?.ownerKey === candidate.ownerKey
      ? activeMetadata.topicsById[candidate.topicUuid]
      : undefined;
  const cachedStream = cachedMetadata?.stream ?? null;
  const cachedTopic = cachedMetadata?.topic ?? null;
  let audience = candidate.audience;
  if (streamSnapshot != null || activeStream != null || cachedStream != null) {
    audience =
      (streamSnapshot?.isPrivate ?? activeStream?.isPrivate ?? cachedStream?.isPrivate)
        ? "private"
        : "channel";
  }
  const streamNotificationMode =
    activeStream?.notificationMode ??
    streamSnapshot?.notificationMode ??
    cachedStream?.notificationMode ??
    candidate.streamNotificationMode;
  const topicNotificationMode =
    activeTopic?.notificationMode ??
    topicSnapshot?.notificationMode ??
    cachedTopic?.notificationMode ??
    candidate.topicNotificationMode;
  const missingMetadata: string[] = [];

  if (
    streamSnapshot == null &&
    activeStream == null &&
    cachedStream == null &&
    candidate.audience === "unknown"
  ) {
    missingMetadata.push("stream");
  }

  if (
    audience !== "private" &&
    streamNotificationMode !== "all_messages" &&
    topicSnapshot == null &&
    activeTopic == null &&
    cachedTopic == null &&
    candidate.topicNotificationMode == null
  ) {
    missingMetadata.push("topic");
  }

  return {
    candidate: {
      ...candidate,
      audience,
      streamName:
        streamSnapshot?.streamName ??
        activeStream?.name ??
        cachedStream?.streamName ??
        candidate.streamName,
      topicName:
        topicSnapshot?.topicName ??
        (activeTopic?.isDefault === true ? null : activeTopic?.name) ??
        cachedTopic?.topicName ??
        candidate.topicName,
      streamNotificationMode,
      topicNotificationMode,
    },
    missingMetadata,
  };
}

async function resolveCandidateMetadata(
  projection: MessengerBackgroundProjection,
  candidate: MessengerBackgroundNotificationCandidate,
): Promise<ReturnType<typeof resolveCurrentCandidate>> {
  const resolved = resolveCurrentCandidate(
    projection,
    candidate,
    readChatsForOwner(candidate.ownerKey),
  );
  if (resolved.missingMetadata.length === 0) {
    return resolved;
  }

  const cachedMetadata = await resolveWorkspaceConversationMetadata({
    ownerKey: candidate.ownerKey,
    streamUuid: candidate.streamUuid,
    topicUuid: candidate.topicUuid,
  });
  return resolveCurrentCandidate(
    projection,
    candidate,
    readChatsForOwner(candidate.ownerKey),
    cachedMetadata,
  );
}

function resolveTitleContext(
  candidate: MessengerBackgroundNotificationCandidate,
  senderName: string,
): NotificationTitleContext {
  if (candidate.audience === "private") {
    return {
      kind: "dm",
      senderName,
      conversationName: trimNonEmpty(candidate.streamName) ?? senderName,
    };
  }

  return {
    kind: "stream",
    senderName,
    channelName: trimNonEmpty(candidate.streamName) ?? senderName,
    topicName: trimNonEmpty(candidate.topicName),
  };
}

function resolveNotificationConversationRoute(
  candidate: MessengerBackgroundNotificationCandidate,
): string {
  return candidate.topicRoute;
}

// The app provides a verified session and its notification projection to the shell.
export interface WorkspaceNotificationOwner {
  ownerKey: string;
  projection: MessengerBackgroundProjection;
  accountLabel: string; // Short label displayed while conversation metadata is unavailable.
  isSelected: () => boolean; // Only the currently selected owner can have a conversation in the viewport.
  isAuthorized: () => boolean; // Recheck after asynchronous metadata and author lookups.
}

interface NotificationCandidateEntry extends WorkspaceNotificationOwner {
  candidate: MessengerBackgroundNotificationCandidate;
}

function collectNextNotificationCandidates(
  routeProjections: readonly WorkspaceNotificationOwner[],
  processedCandidates: Set<string>,
): NotificationCandidateEntry[] {
  return routeProjections
    .flatMap((owner) =>
      [...owner.projection.notificationCandidates]
        // The store keeps new entries first, but stacking should follow natural order.
        .reverse()
        .map((candidate) => ({ ...owner, candidate })),
    )
    .filter((candidate) => {
      if (candidate.candidate.ownerKey !== candidate.ownerKey) {
        return false;
      }

      const messageUuid = trimNonEmpty(candidate.candidate.messageUuid);
      if (messageUuid == null) {
        return false;
      }

      return !processedCandidates.has(buildCandidateScopeKey(candidate.ownerKey, messageUuid));
    })
    .sort((left, right) => left.candidate.observedAt - right.candidate.observedAt);
}

function logDeferredCandidate(options: {
  deferredCandidates: Set<string>;
  scopeKey: string;
  candidate: MessengerBackgroundNotificationCandidate;
  messageUuid: string;
  missingMetadata: string[];
  expired: boolean;
}): void {
  const { deferredCandidates, scopeKey, candidate, messageUuid, missingMetadata } = options;
  if (!options.expired && deferredCandidates.has(scopeKey)) {
    return;
  }

  deferredCandidates.add(scopeKey);
  notificationLog.warn(
    options.expired
      ? "candidate using generic notification: metadata did not arrive in time"
      : "candidate deferred until metadata arrives",
    {
      ownerKey: candidate.ownerKey,
      messageUuid,
      missingMetadata,
      audience: candidate.audience,
      hasStreamMode: candidate.streamNotificationMode != null,
      hasTopicMode: candidate.topicNotificationMode != null,
      waitedMs: Date.now() - candidate.observedAt,
    },
  );
}

function logPolicySkip(options: {
  candidate: MessengerBackgroundNotificationCandidate;
  messageUuid: string;
  trigger: string;
  viewport: ReturnType<typeof readViewportState>;
}): void {
  const { candidate, messageUuid, trigger, viewport } = options;
  notificationLog.warn("candidate skipped by notification policy", {
    ownerKey: candidate.ownerKey,
    messageUuid,
    trigger,
    audience: candidate.audience,
    isOwn: candidate.isOwn,
    read: candidate.read,
    hasCurrentUserMention: candidate.hasCurrentUserMention === true,
    hasWildcardMention: candidate.hasWildcardMention === true,
    notificationEligible: candidate.notificationEligible,
    liveEffectPolicyReason: candidate.liveEffectPolicyReason,
    streamNotificationMode: candidate.streamNotificationMode,
    topicNotificationMode: candidate.topicNotificationMode,
    windowFocused: viewport.windowFocused,
    isConversationOnScreen: viewport.isConversationOnScreen,
  });
}

async function runNotificationEffects(options: {
  candidate: MessengerBackgroundNotificationCandidate;
  messageUuid: string;
  scopeKey: string;
  trigger: string;
  navigate: NavigateFunction;
  processedCandidates: Set<string>;
  deferredCandidates: Set<string>;
  isCancelled: () => boolean;
  metadataUnavailable: boolean;
  accountLabel: string;
}): Promise<void> {
  const { candidate, messageUuid, scopeKey, trigger, navigate, processedCandidates } = options;

  try {
    // Generic notifications must not depend on another metadata lookup.
    const author = options.metadataUnavailable
      ? null
      : await resolveCachedWorkspaceUser({
          ownerKey: candidate.ownerKey,
          userUuid: candidate.authorUuid,
        });
    if (options.isCancelled()) {
      return;
    }

    const senderName = trimNonEmpty(author?.displayName) ?? DEFAULT_NOTIFICATION_SENDER;
    const titleContext = resolveTitleContext(candidate, senderName);
    const body = options.metadataUnavailable
      ? options.accountLabel
      : (trimNonEmpty(candidate.previewText) ?? "");
    const conversationRoute = options.metadataUnavailable
      ? candidate.messageRoute
      : resolveNotificationConversationRoute(candidate);
    const aggregateSnapshot = options.metadataUnavailable
      ? null
      : upsertNotificationAggregate({
          candidate,
          body,
          clickRoute: conversationRoute,
          titleContext,
        });
    const notificationClickRoute = aggregateSnapshot?.latestClickRoute ?? conversationRoute;

    markCandidateProcessed(processedCandidates, candidate.ownerKey, messageUuid);
    options.deferredCandidates.delete(scopeKey);

    const notificationShown = notificationService.show({
      title: options.metadataUnavailable
        ? t("notifications.genericNewMessage")
        : formatNotificationTitle(
            aggregateSnapshot?.titleContext ?? titleContext,
            aggregateSnapshot?.count ?? 1,
          ),
      body: aggregateSnapshot?.latestBody ?? body,
      tag: aggregateSnapshot?.tag ?? `msg:${candidate.ownerKey}::${messageUuid}`,
      silent: true,
      clickRoute: notificationClickRoute,
      onClick: () => {
        if (aggregateSnapshot != null) {
          const aggregateTag = aggregateSnapshot.tag;
          consumeNotificationAggregateByTag(aggregateTag);
          void notificationService.closeByTag(aggregateTag).catch((error) => {
            reportUnexpectedError("layout:notification", error, {
              tag: aggregateTag,
              phase: "dismiss-on-click",
            });
          });
        }
        void navigate(notificationClickRoute);
      },
    });

    const notificationSound = useSettingsStore.getState().notificationSound;
    if (notificationSound !== "none") {
      playNotificationSound(notificationSound);
    }
    const attentionRequested =
      !isElectronDarwin() || getDockBounceEnabledForOwner(candidate.ownerKey);
    if (attentionRequested) {
      osIntegration.requestAttention();
    }

    const shown = await notificationShown;
    notificationLog.warn("candidate notification effects completed", {
      ownerKey: candidate.ownerKey,
      messageUuid,
      trigger,
      nativeShown: shown,
      sound: notificationSound,
      attentionRequested,
    });
    registerNotifiedWorkspaceMessage(candidate.ownerKey, messageUuid);
  } catch (error) {
    markCandidateProcessed(processedCandidates, candidate.ownerKey, messageUuid);
    reportUnexpectedError("layout:notification", error, {
      ownerKey: candidate.ownerKey,
      messageUuid,
      phase: "workspace-runtime-show",
    });
  }
}

export function useLayoutWorkspaceNotifications(options: {
  enabled: boolean;
  owners: readonly WorkspaceNotificationOwner[];
  navigate: NavigateFunction;
  pathname: string;
}): void {
  const { enabled, navigate, pathname, owners: routeProjections } = options;
  const processedCandidatesRef = useRef<Set<string>>(new Set());
  const deferredCandidatesRef = useRef<Set<string>>(new Set());
  const closedMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || routeProjections.length === 0) {
      return;
    }

    for (const { ownerKey, projection, isAuthorized } of routeProjections) {
      if (!isAuthorized()) continue;
      const messageUuidsToClose = Object.values(projection.messageIdSnapshotsById)
        .filter(
          (snapshot) =>
            snapshot.ownerKey === ownerKey &&
            trimNonEmpty(snapshot.messageUuid) != null &&
            (snapshot.read === true || snapshot.deletedAt != null),
        )
        .map((snapshot) => snapshot.messageUuid)
        .filter((messageUuid) => {
          const scopeKey = buildCandidateScopeKey(ownerKey, messageUuid);
          if (closedMessagesRef.current.has(scopeKey)) {
            return false;
          }
          closedMessagesRef.current.add(scopeKey);
          return true;
        });

      if (messageUuidsToClose.length === 0) {
        continue;
      }

      closeReadMessageNotifications(notificationService, messageUuidsToClose, ownerKey);
    }
  }, [enabled, routeProjections]);

  useEffect(() => {
    if (!enabled || routeProjections.length === 0) {
      return;
    }

    let cancelled = false;
    let metadataRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const openConversationId = readOpenConversationId(pathname);

    const scheduleMetadataRetry = (observedAt: number): void => {
      if (cancelled || !Number.isFinite(observedAt) || metadataRetryTimer != null) return;
      const remainingGrace = Math.max(
        1,
        NOTIFICATION_METADATA_GRACE_MS - (Date.now() - observedAt),
      );
      metadataRetryTimer = setTimeout(
        () => {
          metadataRetryTimer = null;
          void showNotifications();
        },
        Math.min(NOTIFICATION_METADATA_RETRY_MS, remainingGrace),
      );
    };

    function deferCandidate(
      candidate: MessengerBackgroundNotificationCandidate,
      messageUuid: string,
      scopeKey: string,
      missingMetadata: string[],
    ): number {
      logDeferredCandidate({
        deferredCandidates: deferredCandidatesRef.current,
        scopeKey,
        candidate,
        messageUuid,
        missingMetadata,
        expired: false,
      });
      return candidate.observedAt;
    }

    async function showNotifications(): Promise<void> {
      let metadataRetryObservedAt = Infinity;
      const nextCandidates = collectNextNotificationCandidates(
        routeProjections,
        processedCandidatesRef.current,
      );
      for (const {
        projection,
        candidate,
        accountLabel,
        isSelected,
        isAuthorized,
      } of nextCandidates) {
        if (cancelled) {
          return;
        }
        if (!isAuthorized()) continue;

        const messageUuid = trimNonEmpty(candidate.messageUuid);
        if (messageUuid == null) {
          continue;
        }

        const scopeKey = buildCandidateScopeKey(candidate.ownerKey, messageUuid);
        const resolvedCandidate = await resolveCandidateMetadata(projection, candidate);
        if (cancelled) {
          return;
        }
        if (!isAuthorized()) continue;

        const metadataUnavailable = resolvedCandidate.missingMetadata.length > 0;
        if (
          metadataUnavailable &&
          Date.now() - candidate.observedAt < NOTIFICATION_METADATA_GRACE_MS
        ) {
          metadataRetryObservedAt = Math.min(
            metadataRetryObservedAt,
            deferCandidate(candidate, messageUuid, scopeKey, resolvedCandidate.missingMetadata),
          );
          continue;
        }

        const currentCandidate = resolvedCandidate.candidate;
        const currentSnapshot = projection.messageIdSnapshotsById[messageUuid];
        if (currentSnapshot?.read === true || currentSnapshot?.deletedAt != null) {
          markCandidateProcessed(processedCandidatesRef.current, candidate.ownerKey, messageUuid);
          notificationLog.warn("candidate skipped because message is no longer active", {
            ownerKey: candidate.ownerKey,
            messageUuid,
            read: currentSnapshot.read,
            deleted: currentSnapshot.deletedAt != null,
          });
          continue;
        }

        if (wasWorkspaceMessageRecentlyNotified(candidate.ownerKey, messageUuid)) {
          markCandidateProcessed(processedCandidatesRef.current, candidate.ownerKey, messageUuid);
          notificationLog.warn("candidate skipped by dedup", {
            ownerKey: candidate.ownerKey,
            messageUuid,
          });
          continue;
        }

        const selected = isSelected();
        const viewport = readViewportState(currentCandidate, selected ? openConversationId : null);
        const decision = shouldWorkspaceDesktopNotify({
          metadataUnavailable,
          message: {
            kind: currentCandidate.audience === "private" ? "dm" : "stream",
            isOwn: currentCandidate.isOwn,
            read: currentCandidate.read,
            hasCurrentUserMention: currentCandidate.hasCurrentUserMention,
            hasWildcardMention: currentCandidate.hasWildcardMention,
            notificationEligible: currentCandidate.notificationEligible,
            streamNotificationMode: currentCandidate.streamNotificationMode,
            topicNotificationMode: currentCandidate.topicNotificationMode,
          },
          viewport,
        });

        if (!decision.notify) {
          markCandidateProcessed(processedCandidatesRef.current, candidate.ownerKey, messageUuid);
          logPolicySkip({
            candidate: currentCandidate,
            messageUuid,
            trigger: decision.trigger,
            viewport,
          });
          continue;
        }

        if (metadataUnavailable) {
          logDeferredCandidate({
            deferredCandidates: deferredCandidatesRef.current,
            scopeKey,
            candidate: currentCandidate,
            messageUuid,
            missingMetadata: resolvedCandidate.missingMetadata,
            expired: true,
          });
        }

        await runNotificationEffects({
          metadataUnavailable,
          candidate: currentCandidate,
          messageUuid,
          scopeKey,
          trigger: decision.trigger,
          navigate,
          processedCandidates: processedCandidatesRef.current,
          deferredCandidates: deferredCandidatesRef.current,
          isCancelled: () => cancelled || !isAuthorized() || isSelected() !== selected,
          accountLabel,
        });
      }

      // Retry after this batch finishes so pending author lookups are not duplicated.
      scheduleMetadataRetry(metadataRetryObservedAt);
    }

    void showNotifications();

    return () => {
      cancelled = true;
      if (metadataRetryTimer != null) clearTimeout(metadataRetryTimer);
    };
  }, [enabled, navigate, pathname, routeProjections]);
}
