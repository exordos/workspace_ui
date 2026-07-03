import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo, useState } from "react";
import { addWorkspaceStreamMembers } from "~/entities/messenger/messenger-stream-member-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  buildUserPickerOptions,
  type UserPickerCandidate,
  type UserPickerId,
} from "~/shared/lib/user-picker";
import {
  AppDialogShell,
  APP_DIALOG_CONTENT_BASE_CLASS,
  DialogCancelButton,
  DialogPrimaryButton,
} from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { UserPickerList } from "~/shared/ui/user-picker-list.ui";
import { useAddStreamMembersStore } from "./add-stream-members.model";

const ADD_STREAM_MEMBERS_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

const CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[70vh] max-w-md -translate-y-1/2 flex-col p-0`;

export interface AddStreamMembersDialogProps {
  onSuccess: (streamId: number) => void;
}

function resolveWorkspacePickerPresence(
  status: User["status"],
): UserPickerCandidate["presenceStatus"] {
  if (status === "active" || status === "idle") {
    return status;
  }
  return undefined;
}

function resolveWorkspaceStatusLabel(status: User["status"]): string | null {
  if (status === "active") return t("presence.online");
  if (status === "idle") return t("presence.away");
  if (status === "offline") return t("presence.offline");
  return t("presence.doNotDisturb");
}

function isUserUuid(value: UserPickerId): value is MessengerUuid {
  return typeof value === "string" && value.trim().length > 0;
}

export const AddStreamMembersDialog: React.FC<AddStreamMembersDialogProps> = ({ onSuccess }) => {
  const open = useAddStreamMembersStore((s) => s.open);
  const streamId = useAddStreamMembersStore((s) => s.streamId);
  const streamName = useAddStreamMembersStore((s) => s.streamName);
  const existingMemberIds = useAddStreamMembersStore((s) => s.existingMemberIds);
  const query = useAddStreamMembersStore((s) => s.query);
  const selectedIds = useAddStreamMembersStore((s) => s.selectedIds);
  const submitting = useAddStreamMembersStore((s) => s.submitting);
  const error = useAddStreamMembersStore((s) => s.error);
  const setQuery = useAddStreamMembersStore((s) => s.setQuery);
  const toggleSelected = useAddStreamMembersStore((s) => s.toggleSelected);
  const close = useAddStreamMembersStore((s) => s.close);
  const submit = useAddStreamMembersStore((s) => s.submit);
  const usersById = useUsersStore((s) => s.usersById);
  const streamsById = useMessengerStore((s) => s.streamsById);
  const streamBindingIdsByStreamId = useMessengerStore((s) => s.streamBindingIdsByStreamId);
  const streamBindingsById = useMessengerStore((s) => s.streamBindingsById);
  const runtimeContext = useWorkspaceAuthStore(selectCurrentWorkspaceRuntimeContext);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const workspaceStream = useMemo(
    () =>
      Object.values(streamsById).find(
        (stream) => stream.audience === "channel" && stream.name === streamName,
      ) ?? null,
    [streamName, streamsById],
  );

  const existingWorkspaceMemberUuids = useMemo(() => {
    if (workspaceStream == null) {
      return null;
    }
    const bindingIds = streamBindingIdsByStreamId[workspaceStream.uuid] ?? [];
    return new Set(
      bindingIds
        .map((bindingId) => streamBindingsById[bindingId]?.userUuid)
        .filter((userUuid): userUuid is MessengerUuid => userUuid != null),
    );
  }, [streamBindingIdsByStreamId, streamBindingsById, workspaceStream]);

  const workspaceMode = workspaceStream != null && runtimeContext != null;

  const candidates = useMemo<UserPickerCandidate[]>(() => {
    if (!workspaceMode) {
      return [];
    }
    return Object.values(usersById).map((user) => ({
      userId: user.uuid,
      fullName: selectUserDisplayName(user, user.username || user.uuid),
      email: user.email ?? undefined,
      presenceStatus: resolveWorkspacePickerPresence(user.status),
      statusLabel: resolveWorkspaceStatusLabel(user.status),
    }));
  }, [usersById, workspaceMode]);

  const excludedUserIds = useMemo(
    () =>
      existingWorkspaceMemberUuids == null
        ? existingMemberIds
        : Array.from(existingWorkspaceMemberUuids),
    [existingMemberIds, existingWorkspaceMemberUuids],
  );

  const options = useMemo(
    () =>
      buildUserPickerOptions({
        candidates,
        selectedUserIds: selectedIds,
        excludedUserIds,
        query,
      }),
    [candidates, excludedUserIds, query, selectedIds],
  );

  const selectedUserIdSet = useMemo(() => new Set<UserPickerId>(selectedIds), [selectedIds]);

  const handleSubmit = useCallback(() => {
    if (workspaceMode && workspaceStream != null && runtimeContext != null) {
      const existing = existingWorkspaceMemberUuids ?? new Set<MessengerUuid>();
      const userUuids = selectedIds
        .filter(isUserUuid)
        .filter((userUuid) => !existing.has(userUuid));
      if (userUuids.length === 0) {
        close();
        return;
      }

      setWorkspaceSubmitting(true);
      setWorkspaceError(null);
      void addWorkspaceStreamMembers({
        runtimeContext,
        getRuntimeContext: useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
        streamUuid: workspaceStream.uuid,
        userUuids,
      })
        .then(() => {
          setWorkspaceSubmitting(false);
          close();
          if (streamId != null) {
            onSuccess(streamId);
          }
        })
        .catch((error: unknown) => {
          reportUnexpectedError("add-stream-members", error, {
            action: "workspace-add-stream-members",
          });
          setWorkspaceSubmitting(false);
          setWorkspaceError(t("app.error"));
        });
      return;
    }

    void submit({ onSuccess });
  }, [
    close,
    existingWorkspaceMemberUuids,
    onSuccess,
    runtimeContext,
    selectedIds,
    streamId,
    submit,
    workspaceMode,
    workspaceStream,
  ]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setWorkspaceError(null);
        close();
      }
    },
    [close],
  );

  return (
    <AppDialogShell open={open} onOpenChange={handleOpenChange} contentClassName={CONTENT_CLASS}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-sm font-semibold text-text-primary">
            {t("channel.addMembers")}
          </Dialog.Title>
          <Dialog.Description className="truncate text-xs text-text-secondary">
            #{streamName}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            className="hover:bg-bg/50 rounded p-1 text-text-muted"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <UserPickerList
          options={options}
          selectedUserIds={selectedUserIdSet}
          onToggle={toggleSelected}
          query={query}
          onQueryChange={setQuery}
          inputClassName={ADD_STREAM_MEMBERS_INPUT_CLASS}
        />

        {(workspaceError ?? error) && (
          <p className="text-xs text-notice-base">{workspaceError ?? t(error!)}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <DialogCancelButton
            disabled={submitting || workspaceSubmitting}
            className="rounded-lg px-3 py-1.5"
          >
            {t("common.cancel")}
          </DialogCancelButton>
          <DialogPrimaryButton
            onClick={handleSubmit}
            disabled={submitting || workspaceSubmitting || selectedIds.length === 0}
            className="rounded-lg px-3 py-1.5"
          >
            {t("common.add")}
          </DialogPrimaryButton>
        </div>
      </div>
    </AppDialogShell>
  );
};
