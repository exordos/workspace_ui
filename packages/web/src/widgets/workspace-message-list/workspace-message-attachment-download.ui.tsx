import { useEffect, useLayoutEffect, useState } from "react";
import { useDownloadStore } from "~/entities/download/download.model";
import type { DownloadEntry } from "~/entities/download/download.types";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { AttachmentReadyCard, type AttachmentDownloadState } from "~/shared/ui/attachment-card";
import { findAttachmentDownload } from "./workspace-message-attachment-download.lib";

const DOWNLOAD_CONFIRMATION_MS = 2_000;

function describeDownload(
  entry: DownloadEntry | undefined,
  isNative: boolean,
  showConfirmation: boolean,
): AttachmentDownloadState | undefined {
  if (entry == null) return;
  if (entry.status === "downloaded") return { status: "downloaded", isNative, showConfirmation };
  if (entry.status === "error")
    return { status: "error", cancelled: entry.errorCode === "cancelled" };
  const total = entry.totalBytes;
  const percent =
    isNative && entry.status === "downloading" && total != null && total > 0
      ? Math.min(100, Math.round((entry.receivedBytes / total) * 100))
      : null;
  return { status: "downloading", percent };
}

function attachmentDownloadLabel(download: AttachmentDownloadState): string {
  switch (download.status) {
    case "downloading":
      return download.percent == null
        ? t("downloads.attachmentDownloading")
        : t("downloads.attachmentDownloadingWithPercent", { percent: download.percent });
    case "downloaded": {
      if (download.isNative) return t("downloads.attachmentOpen");
      return download.showConfirmation
        ? `${t("downloads.browserHandoff")}. ${t("downloads.attachmentDownloadAgain")}`
        : t("downloads.attachmentDownloadAgain");
    }
    case "error":
      return `${t(download.cancelled ? "downloads.cancelled" : "downloads.failed")}. ${t("downloads.attachmentRetry")}`;
  }
}

export function WorkspaceMessageAttachmentDownload({
  reference,
  host,
  ownerKey,
}: Readonly<{
  reference: WorkspaceMessageFileReference;
  host: HTMLElement;
  ownerKey: string;
}>) {
  const entry = useDownloadStore((state) =>
    findAttachmentDownload(state.entries, ownerKey, reference.fileUuid),
  );
  const completedId = entry?.status === "downloaded" ? entry.id : null;
  const [completion, setCompletion] = useState({ id: completedId, visible: false });
  if (completedId !== completion.id) {
    setCompletion({ id: completedId, visible: completedId != null });
  }

  useEffect(() => {
    if (!completion.visible) return;
    const timer = setTimeout(() => {
      setCompletion({ id: completion.id, visible: false });
    }, DOWNLOAD_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [completion.id, completion.visible]);

  const fileName = reference.name ?? t("attachmentCard.unnamedFile");
  const download = describeDownload(
    entry,
    window.electronAPI?.downloads != null,
    completion.visible,
  );
  const label = download == null ? null : `${fileName}. ${attachmentDownloadLabel(download)}`;
  const active = download?.status === "downloading";

  useLayoutEffect(() => {
    if (label == null) return;
    // The sanitized HTML supplies the single focusable host. Keep it mounted
    // while the card inside it changes from download to open or retry.
    const originalLabel = host.getAttribute("aria-label") ?? fileName;
    const originalTitle = host.getAttribute("title") ?? fileName;
    host.setAttribute("aria-label", label);
    host.setAttribute("title", label);
    if (active) {
      host.setAttribute("aria-disabled", "true");
      host.setAttribute("aria-busy", "true");
    }
    return () => {
      host.setAttribute("aria-label", originalLabel);
      host.setAttribute("title", originalTitle);
      host.removeAttribute("aria-disabled");
      host.removeAttribute("aria-busy");
    };
  }, [active, fileName, host, label]);

  return (
    <AttachmentReadyCard
      fileName={fileName}
      contentType={reference.contentType}
      sizeBytes={reference.sizeBytes}
      appearance="embedded"
      role="presentation"
      download={download}
    />
  );
}
