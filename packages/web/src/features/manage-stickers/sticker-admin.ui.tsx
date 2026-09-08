import { useEffect, useRef, useState } from "react";
import { stickerRuntimeKey } from "~/entities/sticker/sticker-workspace.repository";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  useWorkspaceIamCapabilitiesStore,
  selectWorkspaceIamPermissionsForOwner,
} from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { StickerEditor } from "./sticker-editor.ui";
import { StickerImport } from "./sticker-import.ui";

export function StickerAdmin({
  onOpenChange,
}: Readonly<{ onOpenChange?: (open: boolean) => void }>) {
  const { allowed, runtime } = useStickerAdminScope();
  return allowed ? <StickerAdminLauncher key={runtime} onOpenChange={onOpenChange} /> : null;
}
function useStickerAdminScope() {
  const runtime = useWorkspaceAuthStore(() => stickerRuntimeKey());
  const owner = useWorkspaceAuthStore((state) => {
    const context = state.getCurrentRuntimeContext();
    return context ? workspaceRuntimeOwnerKey(context) : null;
  });
  const allowed = useWorkspaceIamCapabilitiesStore(
    (state) =>
      selectWorkspaceIamPermissionsForOwner(state, owner)?.includes(
        "workspace.sticker_catalog.manage",
      ) === true,
  );
  return { allowed, runtime };
}
function StickerAdminLauncher({
  onOpenChange,
}: Readonly<{ onOpenChange?: (open: boolean) => void }>) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  const trigger = useRef<HTMLButtonElement>(null);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="w-full border-t border-border-subtle p-3 text-sm text-text-muted hover:bg-card-bg"
        onClick={() => changeOpen(true)}
      >
        {t("sticker.manage")}
      </button>
      {open && (
        <StickerAdminDialog
          open={open}
          onOpenChange={changeOpen}
          onRestoreFocus={() => trigger.current?.focus()}
        />
      )}
    </>
  );
}

interface StickerAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus?: () => void;
}
export function StickerAdminDialog(props: Readonly<StickerAdminDialogProps>) {
  const { allowed, runtime } = useStickerAdminScope();
  return allowed && props.open ? <StickerAdminDialogContent key={runtime} {...props} /> : null;
}

function StickerAdminDialogContent({
  open,
  onOpenChange,
  onRestoreFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus?: () => void;
}>) {
  const [task, setTask] = useState<"import" | "edit">("import");
  const [editId, setEditId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const edit = (id: string) => {
    setEditId(id);
    setEditVersion((value) => value + 1);
    setTask("edit");
  };
  return (
    <AppDialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        if (!value && dirty) {
          setPendingEdit(null);
          setConfirmClose(true);
        } else onOpenChange(value);
      }}
      title={t("sticker.manage")}
      description={t("sticker.manageHelp")}
      maxWidthClassName="max-w-2xl w-[calc(100%-2rem)]"
      positionClassName="top-[4vh]"
      scrollBody
      showCloseButton={!busy}
      footer={
        confirmClose && dirty ? (
          <div role="alert" className="w-full text-sm">
            <p>{t("sticker.discardHelp")}</p>
            <div className="mt-3 flex justify-end gap-4">
              <button type="button" disabled={busy} onClick={() => setConfirmClose(false)}>
                {t("sticker.keepEditing")}
              </button>
              <button
                type="button"
                className="text-accent"
                disabled={busy}
                onClick={() => {
                  if (pendingEdit) {
                    edit(pendingEdit);
                    setPendingEdit(null);
                    setConfirmClose(false);
                  } else onOpenChange(false);
                }}
              >
                {t("sticker.discard")}
              </button>
            </div>
          </div>
        ) : undefined
      }
      onEscapeKeyDown={(event) => event.stopPropagation()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus?.();
      }}
    >
      <div
        className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-card-bg p-1"
        aria-label={t("sticker.manageTasks")}
      >
        {(["import", "edit"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={task === value}
            className={`rounded-md px-3 py-2 text-sm font-medium ${task === value ? "bg-bg-elevated text-text-primary shadow-sm" : "text-text-muted"}`}
            onClick={() => setTask(value)}
          >
            {t(value === "import" ? "sticker.importTask" : "sticker.editTask")}
          </button>
        ))}
      </div>
      <div hidden={task !== "import"}>
        <StickerImport
          onBusyChange={setBusy}
          onEdit={(id) => {
            if (dirty) {
              setPendingEdit(id);
              setConfirmClose(true);
            } else edit(id);
          }}
        />
      </div>
      <div hidden={task !== "edit"}>
        <StickerEditor
          key={editVersion}
          onDirtyChange={setDirty}
          active={task === "edit"}
          initialId={editId}
          onBusyChange={setBusy}
        />
      </div>
    </AppDialog>
  );
}
