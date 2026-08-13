import { useDownloadStore } from "~/entities/download/download.model";
import type { DownloadEntry } from "~/entities/download/download.types";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { toast } from "~/shared/lib/toast/toast";
import { sanitizeFilename } from "~/shared/lib/validation";

export interface WorkspaceDownloadFileNameInput {
  fileUuid: string;
  fileNameHint?: string | null;
  contentDisposition?: string | null;
}

export interface WorkspaceBrowserDownloadResource {
  blob: Blob;
  headers: Headers;
}

export interface StartWorkspaceFileDownloadInput {
  runtimeContext: WorkspaceRuntimeContext;
  fileUuid: string;
  fileNameHint?: string | null;
  loadBrowserResource: (
    runtimeContext: WorkspaceRuntimeContext,
  ) => Promise<WorkspaceBrowserDownloadResource>;
}

function createDownloadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `workspace-download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function filenameFromContentDisposition(contentDisposition: string | null | undefined): string {
  const header = contentDisposition?.trim() ?? "";
  if (header.length === 0) return "";

  const encodedMatch = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encodedMatch?.[1] != null) {
    return safeDecodeUriComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
  }

  const quotedMatch = /(?:^|;)\s*filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quotedMatch?.[1] != null) return quotedMatch[1].trim();

  const plainMatch = /(?:^|;)\s*filename\s*=\s*([^;]+)/i.exec(header);
  return plainMatch?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
}

export function deriveWorkspaceDownloadFileName(input: WorkspaceDownloadFileNameInput): string {
  const fromHeader = sanitizeFilename(filenameFromContentDisposition(input.contentDisposition));
  if (fromHeader.length > 0) return fromHeader;

  const fromHint = sanitizeFilename(input.fileNameHint?.trim() ?? "");
  if (fromHint.length > 0) return fromHint;

  const fromUuid = sanitizeFilename(input.fileUuid.trim());
  return fromUuid.length > 0 ? fromUuid : "workspace-file";
}

export function parseWorkspaceDownloadTotalBytes(
  rawValue: string | null | undefined,
): number | null {
  if (rawValue == null) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export function triggerWorkspaceBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function findDownload(id: string): DownloadEntry | null {
  return useDownloadStore.getState().entries.find((entry) => entry.id === id) ?? null;
}

function applyCommandFailure(id: string, errorCode?: string): void {
  if (errorCode === "file-missing") {
    useDownloadStore.getState().finishDownload(id, false, "file-missing");
  }
  toast.error(t("app.error"));
}

async function startNativeWorkspaceDownload(
  runtimeContext: WorkspaceRuntimeContext,
  fileUuid: string,
  fileName: string,
  id: string,
): Promise<void> {
  const downloads = window.electronAPI?.downloads;
  if (downloads == null) {
    throw new Error("Electron download bridge is unavailable");
  }

  const result = await downloads.start({
    id,
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    accountId: runtimeContext.accountId,
    fileUuid,
    fileName,
    organizationOrigin: runtimeContext.organizationOrigin,
    accessToken: runtimeContext.accessToken,
  });
  if (!result.ok) {
    useDownloadStore.getState().finishDownload(id, false, "start-failed");
    throw new Error(`Workspace download failed to start: ${result.errorCode}`);
  }
  useDownloadStore.getState().upsertDownload(result.entry);
}

async function startBrowserWorkspaceDownload(
  id: string,
  fileUuid: string,
  fileNameHint: string | null | undefined,
  runtimeContext: WorkspaceRuntimeContext,
  loadResource: (
    runtimeContext: WorkspaceRuntimeContext,
  ) => Promise<WorkspaceBrowserDownloadResource>,
): Promise<void> {
  try {
    const result = await loadResource(runtimeContext);
    const fileName = deriveWorkspaceDownloadFileName({
      fileUuid,
      fileNameHint,
      contentDisposition: result.headers.get("content-disposition"),
    });
    const totalBytes =
      parseWorkspaceDownloadTotalBytes(result.headers.get("content-length")) ?? result.blob.size;
    const currentEntry = findDownload(id);
    if (currentEntry != null && currentEntry.fileName !== fileName) {
      useDownloadStore.getState().upsertDownload({ ...currentEntry, fileName });
    }
    useDownloadStore.getState().setProgress(id, {
      receivedBytes: result.blob.size,
      totalBytes,
    });
    triggerWorkspaceBrowserDownload(result.blob, fileName);
    useDownloadStore.getState().finishDownload(id, true);
  } catch (error) {
    useDownloadStore.getState().finishDownload(id, false, "interrupted");
    throw error;
  }
}

export async function startWorkspaceFileDownload(
  input: StartWorkspaceFileDownloadInput,
): Promise<void> {
  const fileUuid = input.fileUuid.trim();
  if (fileUuid.length === 0) throw new Error("Workspace file UUID is missing");

  const fileName = deriveWorkspaceDownloadFileName({
    fileUuid,
    fileNameHint: input.fileNameHint,
  });
  const runtimeContext = await ensureFreshWorkspaceSession(input.runtimeContext.accountId);
  const id = createDownloadId();
  const started = useDownloadStore.getState().startDownload({
    id,
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    accountId: runtimeContext.accountId,
    fileUuid,
    fileName,
    status: window.electronAPI?.downloads == null ? "downloading" : "starting",
  });
  if (!started) return;

  if (window.electronAPI?.downloads != null) {
    try {
      await startNativeWorkspaceDownload(runtimeContext, fileUuid, fileName, id);
    } catch (error) {
      useDownloadStore.getState().finishDownload(id, false, "start-failed");
      throw error;
    }
    return;
  }

  await startBrowserWorkspaceDownload(
    id,
    fileUuid,
    input.fileNameHint,
    runtimeContext,
    input.loadBrowserResource,
  );
}

export async function cancelWorkspaceDownload(id: string): Promise<void> {
  const downloads = window.electronAPI?.downloads;
  if (downloads == null) return;
  try {
    const result = await downloads.cancel(id);
    if (!result.ok) applyCommandFailure(id, result.errorCode);
  } catch {
    toast.error(t("app.error"));
  }
}

export async function openWorkspaceDownload(id: string): Promise<void> {
  const downloads = window.electronAPI?.downloads;
  if (downloads == null) return;
  try {
    const result = await downloads.open(id);
    if (!result.ok) applyCommandFailure(id, result.errorCode);
  } catch {
    toast.error(t("app.error"));
  }
}

export async function revealWorkspaceDownload(id: string): Promise<void> {
  const downloads = window.electronAPI?.downloads;
  if (downloads == null) return;
  try {
    const result = await downloads.reveal(id);
    if (!result.ok) applyCommandFailure(id, result.errorCode);
  } catch {
    toast.error(t("app.error"));
  }
}

export async function dismissWorkspaceDownloads(ids: readonly string[]): Promise<void> {
  const normalizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (normalizedIds.length === 0) return;
  const downloads = window.electronAPI?.downloads;
  if (downloads != null) {
    try {
      await downloads.dismiss(normalizedIds);
    } catch {
      toast.error(t("app.error"));
      return;
    }
  }
  const store = useDownloadStore.getState();
  for (const id of normalizedIds) store.removeDownload(id);
}

export async function retryWorkspaceDownload(id: string): Promise<void> {
  const entry = findDownload(id);
  const downloads = window.electronAPI?.downloads;
  if (entry?.status !== "error" || downloads == null) return;

  let session: Awaited<ReturnType<typeof ensureFreshWorkspaceSession>>;
  try {
    session = await ensureFreshWorkspaceSession(entry.accountId);
  } catch {
    toast.error(t("app.error"));
    return;
  }

  try {
    await downloads.dismiss([entry.id]);
    useDownloadStore.getState().removeDownload(entry.id);
  } catch {
    toast.error(t("app.error"));
    return;
  }

  const nextId = createDownloadId();
  if (
    !useDownloadStore.getState().startDownload({
      id: nextId,
      ownerKey: entry.ownerKey,
      accountId: entry.accountId,
      fileUuid: entry.fileUuid,
      fileName: entry.fileName,
      status: "starting",
    })
  ) {
    return;
  }

  let result: Awaited<ReturnType<typeof downloads.start>>;
  try {
    result = await downloads.start({
      id: nextId,
      ownerKey: entry.ownerKey,
      accountId: entry.accountId,
      fileUuid: entry.fileUuid,
      fileName: entry.fileName,
      organizationOrigin: session.organizationOrigin,
      accessToken: session.accessToken,
    });
  } catch {
    useDownloadStore.getState().finishDownload(nextId, false, "start-failed");
    return;
  }
  if (!result.ok) {
    useDownloadStore.getState().finishDownload(nextId, false, "start-failed");
    return;
  }
  useDownloadStore.getState().upsertDownload(result.entry);
}
