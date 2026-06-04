import React, { useCallback, useEffect, useMemo, useState } from "react";
import { resolvePinScopeFolderUuid } from "~/features/folder-sync/folder-sync.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { runOptimisticTopicVisibilityLevelUpdate } from "~/features/mute-chat/mute-chat-topic-notification.optimistic.lib";
import { setTopicVisibilityLevel } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { TopicVisibilityLevel } from "~/features/mute-chat/notification-level.lib";
import { orderChatsWithPinnedFirst } from "~/features/pin-chat/pin-chat-order.lib";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { Spinner } from "~/shared/ui/spinner.ui";
import { resolveSidebarFolderEmptyStatePresentation } from "./sidebar-folder-chat-list-empty.lib";
import { SidebarFolderChatRow } from "./sidebar-folder-chat-row.ui";
import { SidebarFolderNewTopicDialog } from "./sidebar-folder-new-topic-dialog.ui";
import type {
  NewTopicDialogState,
  SidebarFolderChatListProps,
} from "./sidebar-folder-chat-list.types";
const EMPTY_PINNED_IDS: string[] = [];

export const SidebarFolderChatList: React.FC<SidebarFolderChatListProps> = ({
  chats,
  selectedFolderId,
  pinFolderId,
  activeStreamSlug: activeStreamSlugProp,
  activeDmIdParam: activeDmIdParamProp,
  activeTopic: activeTopicProp,
  expandedStreamSlugs,
  onToggleStream,
  onNewTopic,
  loading = false,
  showEmptyState = false,
}) => {
  const activeStreamSlug = activeStreamSlugProp ?? null;
  const activeTopic = activeTopicProp ?? null;
  const activeDmIdParam = activeDmIdParamProp ?? null;
  const [topicDialogState, setTopicDialogState] = useState<NewTopicDialogState | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [topicVisibilityOnCreate, setTopicVisibilityOnCreate] =
    useState<TopicVisibilityLevel>("inherit");
  const [muteErrorState, setMuteErrorState] = useState<{
    id: number;
    retry: (() => void) | null;
  } | null>(null);
  const handleMuteError = useCallback((retry: () => void) => {
    setMuteErrorState({ id: Date.now(), retry });
  }, []);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  const canExpandStreams = onToggleStream != null && expandedStreamSlugs !== undefined;
  const pinScopeFolderId = pinFolderId ?? selectedFolderId;
  const allFolderApiUuid = useFolderSyncStore((s) => s.allFolderApiUuid);
  const pinApiFolderUuid = useMemo(
    () =>
      pinScopeFolderId != null
        ? resolvePinScopeFolderUuid(pinScopeFolderId, allFolderApiUuid)
        : null,
    [allFolderApiUuid, pinScopeFolderId],
  );

  const pinnedChatIds = usePinStore((s) =>
    pinApiFolderUuid != null ? s.getPinnedChatIds(pinApiFolderUuid) : EMPTY_PINNED_IDS,
  );
  const orderedChats = useMemo(
    () =>
      pinApiFolderUuid == null || pinnedChatIds.length === 0
        ? chats
        : orderChatsWithPinnedFirst(chats, pinnedChatIds, {
            isMuted: (chat) => chat.type === "stream" && mutedStreamIds.has(chat.stream_id),
          }),
    [chats, mutedStreamIds, pinApiFolderUuid, pinnedChatIds],
  );
  const closeTopicDialog = useCallback(() => {
    setTopicDialogState(null);
    setNewTopicName("");
    setTopicVisibilityOnCreate("inherit");
  }, []);

  const openTopicDialogForStream = useCallback(
    ({ streamId, streamName, streamSlug }: NewTopicDialogState) => {
      // Expand stream before new-topic dialog so context is visible.
      if (
        onToggleStream != null &&
        expandedStreamSlugs !== undefined &&
        !expandedStreamSlugs.includes(streamSlug)
      ) {
        onToggleStream(streamSlug);
      }
      setTopicDialogState({ streamId, streamName, streamSlug });
      setNewTopicName("");
      setTopicVisibilityOnCreate("inherit");
    },
    [expandedStreamSlugs, onToggleStream],
  );

  const runTopicVisibilityOnCreate = useCallback(
    async (streamId: number, topicName: string, level: TopicVisibilityLevel) => {
      if (level === "inherit") return;

      async function attemptSetLevel(): Promise<void> {
        const ok = await runOptimisticTopicVisibilityLevelUpdate({
          streamId,
          topic: topicName,
          level,
          request: () => setTopicVisibilityLevel(streamId, topicName, level),
        });
        if (ok) return;
        handleMuteError(() => {
          void attemptSetLevel();
        });
      }

      await attemptSetLevel();
    },
    [handleMuteError],
  );

  const handleCreateTopicFromDialog = useCallback(() => {
    const topicName = newTopicName.trim();
    if (topicDialogState == null || onNewTopic == null || topicName.length === 0) {
      return;
    }

    onNewTopic(topicDialogState.streamSlug, topicName);

    if (topicVisibilityOnCreate !== "inherit") {
      void runTopicVisibilityOnCreate(
        topicDialogState.streamId,
        topicName,
        topicVisibilityOnCreate,
      );
    }

    closeTopicDialog();
  }, [
    closeTopicDialog,
    newTopicName,
    onNewTopic,
    runTopicVisibilityOnCreate,
    topicDialogState,
    topicVisibilityOnCreate,
  ]);

  useEffect(() => {
    if (muteErrorState == null) return;
    const timerId = window.setTimeout(() => {
      setMuteErrorState(null);
    }, 4500);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [muteErrorState]);

  const emptyStatePresentation = useMemo(
    () => resolveSidebarFolderEmptyStatePresentation(selectedFolderId),
    [selectedFolderId],
  );

  if (loading) {
    return (
      <div className="px-3 py-4">
        <div
          className="bg-bg-elevated/40 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle px-3 py-6 text-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("app.loading")}
        >
          <Spinner size="lg" className="shrink-0" />
          <p className="text-sm text-text-muted">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (orderedChats.length === 0) {
    if (!showEmptyState) return null;

    return (
      <div className="px-3 py-4">
        <div className="bg-bg-elevated/40 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
          <Icon name={emptyStatePresentation.icon} size={18} className="text-text-muted" />
          <p className="text-sm font-medium text-text-primary">{emptyStatePresentation.title}</p>
          <p className="max-w-[220px] text-xs text-text-muted">{emptyStatePresentation.hint}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {muteErrorState && (
        <div className="px-3 pt-2">
          <div className="border-notice-base/30 bg-notice-base/10 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs text-notice-base">
            <span>{t("app.error")}</span>
            <button
              type="button"
              className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base transition-colors"
              onClick={() => {
                const retry = muteErrorState.retry;
                setMuteErrorState(null);
                retry?.();
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-0.5 px-2">
        {orderedChats.map((chat) => (
          <SidebarFolderChatRow
            key={chat.type === "stream" ? `stream-${chat.stream_id}` : `dm-${chat.slug}`}
            chat={chat}
            pinApiFolderUuid={pinApiFolderUuid}
            pinScopeFolderId={pinScopeFolderId}
            isCompactDensity={isCompactDensity}
            canExpandStreams={canExpandStreams}
            expandedStreamSlugs={expandedStreamSlugs ?? []}
            activeStreamSlug={activeStreamSlug}
            activeDmIdParam={activeDmIdParam}
            activeTopic={activeTopic}
            isStreamMuted={isStreamMuted}
            onToggleStream={onToggleStream}
            onNewTopic={onNewTopic}
            openTopicDialogForStream={openTopicDialogForStream}
            onMuteError={handleMuteError}
          />
        ))}
      </div>
      <SidebarFolderNewTopicDialog
        open={topicDialogState != null}
        streamName={topicDialogState?.streamName ?? ""}
        streamMuted={topicDialogState != null ? isStreamMuted(topicDialogState.streamId) : false}
        newTopicName={newTopicName}
        onNewTopicNameChange={setNewTopicName}
        topicVisibilityOnCreate={topicVisibilityOnCreate}
        onTopicVisibilityOnCreateChange={setTopicVisibilityOnCreate}
        onOpenChange={(open) => {
          if (!open) {
            closeTopicDialog();
          }
        }}
        onSubmit={handleCreateTopicFromDialog}
      />
    </>
  );
};
