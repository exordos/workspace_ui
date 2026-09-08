import { useState } from "react";
import { stickerRequestOptions } from "~/entities/sticker/sticker-workspace.repository";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { t } from "~/i18n/i18n";
import { importStickerArchive } from "~/shared/api/messenger-stickers.api";
import type { StickerImportResult } from "~/shared/api/messenger-stickers.api";
import { DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { useStickerAdminRequest } from "./sticker-admin-request.hook";

export function StickerImport({
  onBusyChange,
  onEdit,
}: Readonly<{
  onBusyChange: (busy: boolean) => void;
  onEdit: (id: string) => void;
}>) {
  const [archive, setArchive] = useState<File | null>(null);
  const [result, setResult] = useState<StickerImportResult | null>(null);
  const { run, busy, error } = useStickerAdminRequest();
  const tooLarge = archive != null && archive.size > 40 * 1024 * 1024;
  async function submit() {
    if (!archive || busy) return;
    onBusyChange(true);
    try {
      setResult(null);
      const value = await run((signal) =>
        importStickerArchive(stickerRequestOptions(signal), archive),
      );
      if (value) {
        setResult(value);
        void useStickerStore.getState().refresh();
      }
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">{t("sticker.importHelp")}</p>
      <label className="block space-y-3 rounded-xl border border-dashed border-border-subtle bg-card-bg p-6 text-sm">
        <span className="block font-medium">{t("sticker.archive")}</span>
        <input
          className="block w-full text-sm"
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          onChange={(event) => {
            setArchive(event.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
        {archive && (
          <span className="block text-text-muted">
            {archive.name} · {(archive.size / 1024 / 1024).toFixed(1)} MiB
          </span>
        )}
      </label>
      {tooLarge && <p role="alert">{t("sticker.archiveTooLarge")}</p>}
      {error && <p role="alert">{error}</p>}
      <DialogPrimaryButton
        disabled={!archive || tooLarge}
        isSubmitting={busy}
        onClick={() => void submit()}
      >
        {t("sticker.import")}
      </DialogPrimaryButton>
      {result && (
        <div className="space-y-3 rounded-xl border border-border-subtle p-4">
          <p role="status" className="font-medium">
            {t("sticker.importResult", {
              created: String(result.created),
              duplicates: String(result.duplicates),
            })}
          </p>
          <ul className="max-h-60 divide-y divide-border-subtle overflow-auto">
            {result.items.map((item) => (
              <li
                key={item.client_id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-words">{item.file}</p>
                  <p className="text-text-muted">
                    {item.status === "created" ? t("sticker.created") : t("sticker.duplicate")}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-accent"
                  onClick={() => onEdit(item.sticker_uuid)}
                >
                  {t("sticker.editAction")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
