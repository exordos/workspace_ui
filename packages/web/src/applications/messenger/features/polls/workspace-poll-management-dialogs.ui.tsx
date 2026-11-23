import { useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog";
import { PollDeadline, PollToggle } from "./poll-form-controls.ui";

export function PollCloseDialog({
  open,
  onOpenChange,
  onClose,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void | Promise<void>;
}>) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setFailed(false);
          onOpenChange(next);
        }
      }}
      title={t("pollBubble.closeConfirmTitle")}
      description={t("pollBubble.closeConfirmDescription")}
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("pollBubble.close")}
          submitDisabled={pending}
          onCancel={() => {
            if (!pending) onOpenChange(false);
          }}
          onSubmit={() => {
            if (pending) return;
            setPending(true);
            setFailed(false);
            void Promise.resolve()
              .then(onClose)
              .then(() => onOpenChange(false))
              .catch(() => setFailed(true))
              .finally(() => setPending(false));
          }}
        />
      }
    >
      {failed ? (
        <p role="alert" className="text-danger">
          {t("pollBubble.actionError")}
        </p>
      ) : null}
    </AppDialog>
  );
}

export function PollSettingsDialog({
  open,
  onOpenChange,
  closesAt,
  question,
  allowAddingOptions,
  onSave,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closesAt: string | null;
  question: string;
  allowAddingOptions: boolean;
  onSave: (settings: {
    closesAt: string | null;
    allowAddingOptions: boolean;
  }) => void | Promise<void>;
}>) {
  return open ? (
    <PollSettingsForm
      key={`${closesAt}-${allowAddingOptions}`}
      closesAt={closesAt}
      question={question}
      allowAddingOptions={allowAddingOptions}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  ) : null;
}
function PollSettingsForm({
  closesAt: originalClosesAt,
  question,
  allowAddingOptions: initialAllow,
  onOpenChange,
  onSave,
}: Readonly<{
  closesAt: string | null;
  question: string;
  allowAddingOptions: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: {
    closesAt: string | null;
    allowAddingOptions: boolean;
  }) => void | Promise<void>;
}>) {
  const { t } = useTranslation();
  const [closesAt, setClosesAt] = useState<Date | null>(() =>
    originalClosesAt ? new Date(originalClosesAt) : null,
  );
  const [showDate, setShowDate] = useState(Boolean(originalClosesAt));
  const [allowAddingOptions, setAllowAddingOptions] = useState(initialAllow);
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = () => {
    if (pending) return;
    const now = Date.now();
    if (
      (originalClosesAt && Date.parse(originalClosesAt) <= now) ||
      (showDate && (!closesAt || closesAt.getTime() <= now))
    ) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setFailed(false);
    void Promise.resolve()
      .then(() =>
        onSave({
          closesAt: showDate ? (closesAt?.toISOString() ?? null) : null,
          allowAddingOptions,
        }),
      )
      .then(() => onOpenChange(false))
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  };
  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("pollForm.edit")}
      scrollBody
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.save")}
          submitDisabled={pending}
          onCancel={() => {
            if (!pending) onOpenChange(false);
          }}
          onSubmit={save}
        />
      }
    >
      <div className="space-y-4 text-sm text-text-primary">
        <p className="font-semibold">{question}</p>
        <PollDeadline
          compact
          value={closesAt}
          enabled={showDate}
          invalid={invalid}
          onValueChange={(value) => {
            setClosesAt(value);
            setInvalid(false);
          }}
          onEnabledChange={(enabled) => {
            setShowDate(enabled);
            if (!enabled) setClosesAt(null);
            setInvalid(false);
          }}
        />
        <PollToggle
          label={t("pollForm.addOptions")}
          hint={t("pollForm.addOptionsHint")}
          checked={allowAddingOptions}
          onChange={setAllowAddingOptions}
        />
        {failed && (
          <p role="alert" className="text-danger">
            {t("pollBubble.actionError")}
          </p>
        )}
      </div>
    </AppDialog>
  );
}
