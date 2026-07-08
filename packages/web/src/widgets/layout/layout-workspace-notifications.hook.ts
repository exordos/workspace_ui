import { useEffect, useMemo, useRef } from "react";
import {
  useMessengerBackgroundProjectionStore,
  type MessengerBackgroundProjection,
  type MessengerBackgroundNotificationCandidate,
} from "~/entities/messenger/messenger-background-projection.model";
import { resolveCachedWorkspaceUser } from "~/entities/user/user-sync.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import {
  registerNotifiedWorkspaceMessage,
  wasWorkspaceMessageRecentlyNotified,
} from "~/shared/lib/notification-dedup.lib";
import { notificationService } from "~/shared/lib/notifications";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { shouldWorkspaceDesktopNotify } from "~/shared/lib/workspace-desktop-notifications.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import {
  formatNotificationTitle,
  type NotificationTitleContext,
} from "./layout-notification-title.lib";
import { upsertNotificationAggregate } from "./notification-aggregate-registry.lib";
import type { NavigateFunction } from "react-router-dom";

const DEFAULT_NOTIFICATION_SENDER = "New message";

function trimNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function readViewportState(): { windowFocused: boolean; isMessageOnScreen: boolean } {
  if (typeof document === "undefined") {
    return { windowFocused: true, isMessageOnScreen: false };
  }

  return {
    windowFocused: document.hasFocus(),
    isMessageOnScreen: false,
  };
}

function buildCandidateScopeKey(ownerKey: string, messageUuid: string): string {
  return `${ownerKey}::${messageUuid}`;
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

export function useLayoutWorkspaceNotifications(options: {
  enabled: boolean;
  navigate: NavigateFunction;
}): void {
  const { enabled, navigate } = options;
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const projectionsByOwnerKey = useMessengerBackgroundProjectionStore(
    (state) => state.projectionsByOwnerKey,
  );
  const routeProjections = useMemo<
    { ownerKey: string; projection: MessengerBackgroundProjection }[]
  >(() => {
    const seenOwnerKeys = new Set<string>();
    const snapshots: { ownerKey: string; projection: MessengerBackgroundProjection }[] = [];

    for (const session of sessions) {
      const ownerKey = workspaceRuntimeOwnerKey(session);
      if (seenOwnerKeys.has(ownerKey)) {
        continue;
      }

      seenOwnerKeys.add(ownerKey);
      const projection = projectionsByOwnerKey[ownerKey];
      if (projection != null) {
        snapshots.push({ ownerKey, projection });
      }
    }

    return snapshots;
  }, [projectionsByOwnerKey, sessions]);
  const processedCandidatesRef = useRef<Set<string>>(new Set());
  const closedMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || routeProjections.length === 0) {
      return;
    }

    for (const { ownerKey, projection } of routeProjections) {
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
    // Projection хранит историю candidates, поэтому отдельно помним уже обработанные UUID,
    // иначе layout будет переигрывать старые уведомления при каждом обновлении store.
    const nextCandidates = routeProjections
      .flatMap(({ ownerKey, projection }) =>
        [...projection.notificationCandidates]
          // В store новые записи лежат первыми, а стекинг должен идти по естественному порядку.
          .reverse()
          .map((candidate) => ({ ownerKey, projection, candidate })),
      )
      .filter((candidate) => {
        if (candidate.candidate.ownerKey !== candidate.ownerKey) {
          return false;
        }

        const messageUuid = trimNonEmpty(candidate.candidate.messageUuid);
        if (messageUuid == null) {
          return false;
        }

        const scopeKey = buildCandidateScopeKey(candidate.ownerKey, messageUuid);
        if (processedCandidatesRef.current.has(scopeKey)) {
          return false;
        }

        processedCandidatesRef.current.add(scopeKey);
        return true;
      })
      .sort((left, right) => left.candidate.observedAt - right.candidate.observedAt);

    if (nextCandidates.length === 0) {
      return;
    }

    async function showNotifications(): Promise<void> {
      for (const { projection, candidate } of nextCandidates) {
        if (cancelled) {
          return;
        }

        const messageUuid = trimNonEmpty(candidate.messageUuid);
        if (messageUuid == null) {
          continue;
        }

        const currentSnapshot = projection.messageIdSnapshotsById[messageUuid];
        if (currentSnapshot?.read === true || currentSnapshot?.deletedAt != null) {
          continue;
        }

        if (wasWorkspaceMessageRecentlyNotified(candidate.ownerKey, messageUuid)) {
          continue;
        }

        const decision = shouldWorkspaceDesktopNotify({
          message: {
            kind: candidate.audience === "private" ? "dm" : "stream",
            isOwn: candidate.isOwn,
            read: candidate.read,
            hasCurrentUserMention: candidate.hasCurrentUserMention,
            hasWildcardMention: candidate.hasWildcardMention,
            streamNotificationMode: candidate.streamNotificationMode,
            topicNotificationMode: candidate.topicNotificationMode,
          },
          viewport: readViewportState(),
        });

        if (!decision.notify) {
          continue;
        }

        try {
          const author = await resolveCachedWorkspaceUser({
            ownerKey: candidate.ownerKey,
            userUuid: candidate.authorUuid,
          });
          if (cancelled) {
            return;
          }

          const senderName = trimNonEmpty(author?.displayName) ?? DEFAULT_NOTIFICATION_SENDER;
          const titleContext = resolveTitleContext(candidate, senderName);
          const body = trimNonEmpty(candidate.previewText) ?? "";
          const aggregateSnapshot = upsertNotificationAggregate({
            candidate,
            body,
            clickRoute: candidate.messageRoute,
            titleContext,
          });

          await notificationService.show({
            title: formatNotificationTitle(
              aggregateSnapshot?.titleContext ?? titleContext,
              aggregateSnapshot?.count ?? 1,
            ),
            body: aggregateSnapshot?.latestBody ?? body,
            tag: aggregateSnapshot?.tag ?? `msg:${candidate.ownerKey}::${messageUuid}`,
            silent: true,
            clickRoute: aggregateSnapshot?.latestClickRoute ?? candidate.messageRoute,
            onClick: () => {
              void navigate(aggregateSnapshot?.latestClickRoute ?? candidate.messageRoute);
            },
          });

          registerNotifiedWorkspaceMessage(candidate.ownerKey, messageUuid);
        } catch (error) {
          reportUnexpectedError("layout:notification", error, {
            ownerKey: candidate.ownerKey,
            messageUuid,
            phase: "workspace-runtime-show",
          });
        }
      }
    }

    void showNotifications();

    return () => {
      cancelled = true;
    };
  }, [enabled, navigate, routeProjections]);
}
