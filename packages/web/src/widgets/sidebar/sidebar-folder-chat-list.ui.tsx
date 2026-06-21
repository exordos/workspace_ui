import React, { useMemo } from "react";
import { resolvePinScopeFolderUuid } from "~/features/folder-sync/folder-sync.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { orderChatsWithPinnedFirst } from "~/features/pin-chat/pin-chat-order.lib";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { Spinner } from "~/shared/ui/spinner.ui";
import { resolveSidebarFolderEmptyStatePresentation } from "./sidebar-folder-chat-list-empty.lib";
import { SidebarFolderChatRow } from "./sidebar-folder-chat-row.ui";
import type { SidebarFolderChatListProps } from "./sidebar-folder-chat-list.types";
const EMPTY_PINNED_IDS: string[] = [];

export const SidebarFolderChatList: React.FC<SidebarFolderChatListProps> = ({
  chats,
  selectedFolderId,
  pinFolderId,
  activeStreamSlug: activeStreamSlugProp,
  activeTopic: activeTopicProp,
  expandedStreamSlugs,
  onToggleStream,
  loading = false,
  showEmptyState = false,
}) => {
  const activeStreamSlug = activeStreamSlugProp ?? null;
  const activeTopic = activeTopicProp ?? null;
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
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
            isMuted: () => false,
          }),
    [chats, pinApiFolderUuid, pinnedChatIds],
  );

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
      <div className="space-y-0.5 px-2">
        {orderedChats.map((chat) => (
          <SidebarFolderChatRow
            key={`stream-${chat.streamUuid}`}
            chat={chat}
            pinApiFolderUuid={pinApiFolderUuid}
            isCompactDensity={isCompactDensity}
            canExpandStreams={canExpandStreams}
            expandedStreamSlugs={expandedStreamSlugs ?? []}
            activeStreamSlug={activeStreamSlug}
            activeTopic={activeTopic}
            onToggleStream={onToggleStream}
          />
        ))}
      </div>
    </>
  );
};
