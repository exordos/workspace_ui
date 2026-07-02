import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  mapNotificationLevelToWorkspaceStreamMode,
  mapWorkspaceStreamNotificationModeToLevel,
  type WorkspaceStreamNotificationLevel,
} from "~/entities/messenger/messenger-notification-mode.lib";
import { runWorkspaceStreamNotificationUpdate } from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import { t } from "~/i18n/i18n";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

export interface RightPanelWorkspaceInfoProps {
  info: WorkspaceRightPanelInfoView;
}

interface NotificationActionState {
  streamUuid: string | null;
  pending: boolean;
  error: string | null;
}

function createNotificationActionState(streamUuid: string | null): NotificationActionState {
  return {
    streamUuid,
    pending: false,
    error: null,
  };
}

export const RightPanelWorkspaceInfo: React.FC<RightPanelWorkspaceInfoProps> = ({ info }) => {
  const navigate = useNavigate();
  const [notificationActionState, setNotificationActionState] = useState<NotificationActionState>(
    () => createNotificationActionState(info.streamUuid),
  );
  const notificationPending =
    notificationActionState.streamUuid === info.streamUuid && notificationActionState.pending;
  const notificationError =
    notificationActionState.streamUuid === info.streamUuid ? notificationActionState.error : null;
  const storeNotificationMode = useMessengerStore((state) =>
    info.streamUuid == null ? null : (state.streamsById[info.streamUuid]?.notificationMode ?? null),
  );
  const notificationMode = storeNotificationMode ?? info.notificationMode;
  const notificationLevel = useMemo<WorkspaceStreamNotificationLevel | null>(
    () =>
      notificationMode == null ? null : mapWorkspaceStreamNotificationModeToLevel(notificationMode),
    [notificationMode],
  );
  const handleOpenTopic = useCallback(
    (route: string) => {
      void navigate(route);
    },
    [navigate],
  );

  useEffect(() => {
    setNotificationActionState((prev) =>
      prev.streamUuid === info.streamUuid ? prev : createNotificationActionState(info.streamUuid),
    );
  }, [info.streamUuid]);

  const handleSetNotificationLevel = useCallback(
    async (level: WorkspaceStreamNotificationLevel): Promise<void> => {
      if (info.streamUuid == null || notificationPending) return;

      const streamUuid = info.streamUuid;
      const nextNotificationMode = mapNotificationLevelToWorkspaceStreamMode(level);
      if (notificationMode === nextNotificationMode) return;

      setNotificationActionState({
        streamUuid,
        pending: true,
        error: null,
      });
      try {
        await runWorkspaceStreamNotificationUpdate({
          streamUuid,
          notificationMode: nextNotificationMode,
        });
      } catch (error) {
        reportUnexpectedError("workspace-right-panel", error, {
          action: "stream-notifications",
        });
        setNotificationActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                streamUuid,
                pending: false,
                error: t("app.error"),
              }
            : prev,
        );
      } finally {
        setNotificationActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                streamUuid,
                pending: false,
                error: prev.error,
              }
            : prev,
        );
      }
    },
    [info.streamUuid, notificationMode, notificationPending],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-0">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.channelInfo")}</h2>
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
            {info.title.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{info.title}</p>
            <p className="text-[11px] text-text-secondary">
              {t("channel.participants", { count: info.participantsCount })},{" "}
              {t("channel.online", { count: info.onlineCount })}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 space-y-4 px-4 py-3">
        <div>
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {t("channel.notifications")}
          </p>
          {info.streamUuid != null && notificationLevel != null ? (
            <>
              <StreamNotificationLevelSwitch
                value={notificationLevel}
                disabled={notificationPending}
                onChange={(level) => {
                  void handleSetNotificationLevel(level);
                }}
                className="mx-2"
              />
              <p className="mx-2 mt-2 text-[11px] text-text-muted">
                {notificationLevel === "default" && t("channel.notificationDefault")}
                {notificationLevel === "muted" && t("channel.notificationMuted")}
                {notificationLevel === "subscribed" && t("channel.notificationSubscribed")}
              </p>
              {notificationError && (
                <p className="mx-2 mt-1 text-xs text-notice-base">{notificationError}</p>
              )}
            </>
          ) : (
            <p className="mx-2 rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-muted">
              {t("workspaceMessenger.actionUnsupported")}
            </p>
          )}
        </div>

        {info.description && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("chatInfo.description")}
            </h3>
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-primary">
              {info.description}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("channel.topics")}
          </h3>
          {info.topics.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-muted">{t("channel.noTopics")}</p>
          ) : (
            <ul className="space-y-1.5">
              {info.topics.map((topic) => {
                const topicDisplay = resolveTopicDisplayInfo(topic.name);
                return (
                  <li key={topic.id}>
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                      onClick={() => handleOpenTopic(topic.route)}
                    >
                      <span className={`truncate ${topicDisplay.isSystem ? "italic" : ""}`}>
                        {topicDisplay.label}
                      </span>
                      {topic.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent">
                          {topic.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="flex items-center gap-2">
              <Icon name="profile" size={16} className="shrink-0 text-current" />
              {t("channel.members")}
            </span>
          </h3>
          <p className="px-2 py-3 text-center text-sm text-text-muted">
            {t("channel.membersTemporarilyUnavailable")}
          </p>
        </div>
      </ScrollArea>
    </div>
  );
};
