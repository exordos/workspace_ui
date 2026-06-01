import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo } from "react";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { buildUserPickerOptions } from "~/shared/lib/user-picker";
import { Icon } from "~/shared/ui/icon";
import { UserPickerList } from "~/shared/ui/user-picker-list.ui";
import { useAddStreamMembersStore } from "./add-stream-members.model";

// Единый стиль текстового поля: аккуратный фокус через border без двойной обводки.
const ADD_STREAM_MEMBERS_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

export interface AddStreamMembersDialogProps {
  onSuccess: (streamId: number) => void;
}

export const AddStreamMembersDialog: React.FC<AddStreamMembersDialogProps> = ({ onSuccess }) => {
  const open = useAddStreamMembersStore((s) => s.open);
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
  const users = useUsersStore((s) => s.users);

  const candidates = useMemo(
    () =>
      Array.from(users.values()).map((user) => ({
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        presenceStatus: user.presence?.status,
        presenceTimestamp: user.presence?.timestamp,
        statusLabel: formatUserStatusLabel(user.status),
      })),
    [users],
  );

  const excludedUserIds = useMemo(() => existingMemberIds, [existingMemberIds]);

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

  const selectedUserIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleSubmit = useCallback(() => {
    void submit({ onSuccess });
  }, [onSuccess, submit]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        close();
      }
    },
    [close],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-modal flex max-h-[70vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
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

            {error && <p className="text-xs text-notice-base">{t(error)}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                  disabled={submitting}
                >
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || selectedIds.length === 0}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90 disabled:opacity-60"
              >
                {t("common.add")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
