import React, { useCallback, useMemo, useState } from "react";
import { t } from "~/i18n/i18n";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { useMarkTopicResolved } from "./mark-topic-resolved.hook";
import { RenameStreamTopicDialog } from "./rename-stream-topic-dialog.ui";

export const MarkTopicResolvedHeaderMenu = React.memo(function MarkTopicResolvedHeaderMenu() {
  const {
    canToggle,
    isResolved,
    toggleTopicResolved,
    pending,
    channelName,
    renameDialogOpen,
    setRenameDialogOpen,
    renameTopicDraft,
    setRenameTopicDraft,
    openRenameDialog,
    submitRename,
    renamePending,
  } = useMarkTopicResolved();
  const [menuOpen, setMenuOpen] = useState(false);

  const resolveLabel = isResolved ? t("channel.markTopicAsNotDone") : t("channel.markTopicAsDone");

  const handleResolveSelect = useCallback(() => {
    toggleTopicResolved();
    setMenuOpen(false);
  }, [toggleTopicResolved]);

  const handleRenameSelect = useCallback(() => {
    openRenameDialog();
    setMenuOpen(false);
  }, [openRenameDialog]);

  const menuItems = useMemo<DropdownMenuItem[]>(
    () => [
      {
        type: "action",
        label: t("channel.renameTopic"),
        icon: "pen",
        disabled: pending,
        onSelect: handleRenameSelect,
      },
      {
        type: "action",
        label: resolveLabel,
        icon: "check",
        disabled: pending,
        onSelect: handleResolveSelect,
      },
    ],
    [handleRenameSelect, handleResolveSelect, pending, resolveLabel],
  );

  if (!canToggle) {
    return null;
  }

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={menuItems}
        contentVariant="narrow"
        trigger={
          <button
            type="button"
            className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t("a11y.chatMenu")}
            disabled={pending}
          >
            <Icon name="more" size={20} className="text-current" />
          </button>
        }
        contentProps={{
          sideOffset: 4,
          align: "end",
        }}
      />
      <RenameStreamTopicDialog
        open={renameDialogOpen}
        channelName={channelName}
        topicName={renameTopicDraft}
        onTopicNameChange={setRenameTopicDraft}
        pending={renamePending}
        onOpenChange={setRenameDialogOpen}
        onSubmit={submitRename}
      />
    </>
  );
});
