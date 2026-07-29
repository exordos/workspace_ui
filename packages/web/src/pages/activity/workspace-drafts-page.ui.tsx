import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acceptWorkspaceComposerDraftServerVersion,
  deleteWorkspaceComposerDraft,
  keepWorkspaceComposerDraftLocalVersion,
  refreshWorkspaceComposerDrafts,
} from "~/entities/composer-draft/composer-draft-actions.lib";
import { useWorkspaceComposerDraftStore } from "~/entities/composer-draft/composer-draft.model";
import type { WorkspaceComposerDraft } from "~/entities/composer-draft/composer-draft.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { formatActivityItemTime } from "~/shared/lib/datetime.lib";
import { workspaceMessengerTopicRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { Icon } from "~/shared/ui/icon";

function draftTime(value: number): string {
  return Number.isFinite(value) ? formatActivityItemTime(Math.floor(value / 1000)) : "";
}

function draftPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 160)}…`;
}

function channelAvatarStyle(color: number | null | undefined): React.CSSProperties | undefined {
  if (color == null || !Number.isInteger(color) || color < 0 || color > 0xffffff) return undefined;
  return { backgroundColor: `#${color.toString(16).padStart(6, "0")}` };
}

function draftSyncStatusText(draft: WorkspaceComposerDraft): string {
  if (draft.disposition === "consumed" && draft.syncStatus === "failed") {
    return t("workspaceDrafts.deleteFailed");
  }

  switch (draft.syncStatus) {
    case "local":
      return t("workspaceDrafts.local");
    case "saving":
      return t("workspaceDrafts.saving");
    case "failed":
      return t("workspaceDrafts.failed");
    case "conflict":
      return t("workspaceDrafts.conflict");
    case "saved":
      return "";
    case "deleting":
      return t("workspaceDrafts.deleting");
  }
}

function DraftCard({
  draft,
  onOpen,
  onDelete,
  onAcceptServer,
  onKeepLocal,
}: Readonly<{
  draft: WorkspaceComposerDraft;
  onOpen: (draft: WorkspaceComposerDraft) => void;
  onDelete: (draft: WorkspaceComposerDraft) => void;
  onAcceptServer: (draft: WorkspaceComposerDraft) => void;
  onKeepLocal: (draft: WorkspaceComposerDraft) => void;
}>): React.ReactElement {
  const stream = useMessengerStore((state) => state.streamsById[draft.streamUuid]);
  const topic = useMessengerStore((state) => state.topicsById[draft.topicUuid]);
  const directUserUuid = stream?.directUserUuid ?? null;
  const directUser = useUsersStore((state) =>
    directUserUuid == null ? null : (state.usersById[directUserUuid] ?? null),
  );
  const streamName = stream?.name.trim() || draft.streamUuid;
  const topicName = topic?.name.trim() || draft.topicUuid;
  const isDirect = directUserUuid != null;
  const avatarUrn = directUser?.avatarUrl ?? null;
  const avatarStyle = isDirect ? undefined : channelAvatarStyle(stream?.color);
  const isConsumed = draft.disposition === "consumed";
  const canOpen = !isConsumed;
  const hasConflictActions = draft.syncStatus === "conflict";
  const canRetryDeletion = isConsumed && draft.syncStatus === "failed";
  const hasBottomActions = hasConflictActions || canRetryDeletion;
  const syncStatusText = draftSyncStatusText(draft);
  const contentClassName = `min-w-0 flex-1 text-left${hasBottomActions ? " pb-8" : ""}`;
  const cardContent = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5">
          {isDirect ? t("workspaceDrafts.direct") : t("workspaceDrafts.channel")}
        </span>
        <span className="truncate">{isDirect ? streamName : `#${streamName}`}</span>
        <span>·</span>
        <span className="truncate">{topicName}</span>
        <span className="ml-auto shrink-0">{draftTime(draft.updatedAt)}</span>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-text-primary">
        {draftPreview(draft.content.text)}
      </p>
      {draft.syncStatus !== "saved" ? (
        <p className="mt-1 text-[11px] text-text-muted">{syncStatusText}</p>
      ) : null}
    </>
  );

  return (
    <li className="bg-bg-elevated/40 group relative flex gap-3 rounded-xl border border-border-subtle p-3 transition-colors hover:bg-card-bg">
      <div className="pt-0.5">
        <WorkspaceAvatar size="sm" avatarUrn={avatarUrn} style={avatarStyle}>
          {isDirect ? streamName.slice(0, 1) : "#"}
        </WorkspaceAvatar>
      </div>
      {canOpen ? (
        <button type="button" onClick={() => onOpen(draft)} className={contentClassName}>
          {cardContent}
        </button>
      ) : (
        <div className={contentClassName}>{cardContent}</div>
      )}
      {hasConflictActions ? (
        <div className="absolute bottom-3 left-12 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onAcceptServer(draft)}
            className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-primary hover:bg-card-bg"
          >
            {t("workspaceDrafts.conflictAcceptServer")}
          </button>
          <button
            type="button"
            onClick={() => onKeepLocal(draft)}
            className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-primary hover:bg-card-bg"
          >
            {t("workspaceDrafts.conflictKeepLocal")}
          </button>
          <button
            type="button"
            onClick={() => onDelete(draft)}
            className="text-danger-base rounded px-2 py-1 text-[11px] hover:bg-bg-elevated"
          >
            {t("workspaceDrafts.conflictDeleteServer")}
          </button>
        </div>
      ) : null}
      {canRetryDeletion ? (
        <div className="absolute bottom-3 left-12">
          <button
            type="button"
            onClick={() => onDelete(draft)}
            className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-primary hover:bg-card-bg"
          >
            {t("workspaceDrafts.retryDeletion")}
          </button>
        </div>
      ) : null}
      {canOpen ? (
        <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onOpen(draft)}
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label={t("activity.editDraft")}
            title={t("activity.editDraft")}
          >
            <Icon name="newWindow" size={16} />
          </button>
          {!hasConflictActions ? (
            <button
              type="button"
              onClick={() => onDelete(draft)}
              className="hover:text-danger-base rounded p-1 text-text-muted hover:bg-bg-elevated"
              aria-label={t("activity.deleteDraft")}
              title={t("activity.deleteDraft")}
            >
              <Icon name="delete" size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export const WorkspaceDraftsPage: React.FC = () => {
  const navigate = useNavigate();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const draftsByKey = useWorkspaceComposerDraftStore((state) => state.draftsByKey);
  const drafts = useMemo(
    () =>
      ownerKey == null
        ? []
        : Object.values(draftsByKey)
            .filter((draft) => draft.ownerKey === ownerKey)
            .sort((left, right) => right.updatedAt - left.updatedAt),
    [draftsByKey, ownerKey],
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    if (runtimeContext == null) return;
    const controller = new AbortController();
    setIsRefreshing(true);
    setHasLoadError(false);
    void refreshWorkspaceComposerDrafts({
      runtimeContext,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: controller.signal,
    })
      .catch(() => {
        if (!controller.signal.aborted) setHasLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRefreshing(false);
      });
    return () => controller.abort();
  }, [runtimeContext]);

  const handleOpen = useCallback(
    (draft: WorkspaceComposerDraft) => {
      if (runtimeContext == null) return;
      void navigate(
        `${workspaceMessengerTopicRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          streamUuid: draft.streamUuid,
          topicUuid: draft.topicUuid,
        })}?draft_uuid=${encodeURIComponent(draft.draftUuid)}`,
      );
    },
    [navigate, runtimeContext],
  );
  const handleDelete = useCallback(
    (draft: WorkspaceComposerDraft) => {
      if (runtimeContext == null) return;
      void deleteWorkspaceComposerDraft(
        {
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        },
        draft.draftUuid,
      );
    },
    [runtimeContext],
  );
  const handleAcceptServer = useCallback((draft: WorkspaceComposerDraft) => {
    acceptWorkspaceComposerDraftServerVersion(draft.ownerKey, draft.draftUuid);
  }, []);
  const handleKeepLocal = useCallback(
    (draft: WorkspaceComposerDraft) => {
      if (runtimeContext == null) return;
      void keepWorkspaceComposerDraftLocalVersion(
        {
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        },
        draft.draftUuid,
      );
    },
    [runtimeContext],
  );

  if (runtimeContext == null) {
    return (
      <div className="p-4 text-sm text-text-muted">
        {t("workspaceMessenger.runtimeUnavailable")}
      </div>
    );
  }
  if (isRefreshing && drafts.length === 0)
    return <div className="p-4 text-sm text-text-muted">{t("app.loading")}</div>;
  if (hasLoadError && drafts.length === 0)
    return <div className="p-4 text-sm text-text-muted">{t("workspaceDrafts.loadError")}</div>;
  if (drafts.length === 0)
    return <div className="p-4 text-sm text-text-muted">{t("activity.noDrafts")}</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasLoadError ? (
        <p className="px-3 pt-3 text-xs text-text-muted">{t("workspaceDrafts.loadError")}</p>
      ) : null}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.key}
            draft={draft}
            onOpen={handleOpen}
            onDelete={handleDelete}
            onAcceptServer={handleAcceptServer}
            onKeepLocal={handleKeepLocal}
          />
        ))}
      </ul>
    </div>
  );
};
