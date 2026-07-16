/**
 * Workspace file uploads.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import { sanitizeFilename, validateFileUpload } from "~/shared/lib/validation";
import {
  getCurrentInstance,
  getMessengerWorkspaceApiBaseForCurrentInstance,
  messengerApi,
} from "./client";
import { ensureMessengerApiReady } from "./messenger-pipeline.internal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UploadFileOptions {
  signal?: AbortSignal;
  streamUuid?: string;
}

interface WorkspaceFileUploadResponse {
  uuid: string;
}

function readWorkspaceFileUploadResponse(data: unknown): WorkspaceFileUploadResponse {
  if (data == null || typeof data !== "object") {
    throw new Error("No file UUID returned from upload");
  }
  const uuid = (data as { uuid?: unknown }).uuid;
  if (typeof uuid !== "string" || !UUID_RE.test(uuid.trim())) {
    throw new Error("No file UUID returned from upload");
  }
  return { uuid: uuid.trim().toLowerCase() };
}

function readUploadErrorMessage(data: unknown): string | null {
  if (data == null || typeof data !== "object") {
    return null;
  }
  const message = (data as { msg?: unknown }).msg;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

export function buildWorkspaceFileUrn(fileUuid: string, file: File): string {
  const normalized = fileUuid.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) {
    throw new Error("Invalid uploaded file UUID");
  }
  const contentType = file.type.trim().toLowerCase();
  const kind = contentType.startsWith("image/")
    ? "image"
    : contentType.startsWith("video/")
      ? "video"
      : "file";
  const metadata = new URLSearchParams();
  metadata.set("name", sanitizeFilename(file.name) || "file");
  if (contentType !== "") {
    metadata.set("content_type", contentType);
  }
  if (file.size > 0) {
    metadata.set("size", String(file.size));
  }
  return `urn:${kind}:${normalized}?${metadata.toString()}`;
}

async function uploadWorkspaceFileMultipart(
  file: File,
  streamUuid: string,
  options?: UploadFileOptions,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("stream_uuid", streamUuid);

  const res = await messengerApi.postFormDataWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/files/",
    form,
    options?.signal,
  );
  if (!res.ok) {
    throw new Error(
      readUploadErrorMessage(res.data) ?? t("app.errorStatus", { status: String(res.status) }),
    );
  }

  return buildWorkspaceFileUrn(readWorkspaceFileUploadResponse(res.data).uuid, file);
}

/** Uploads a file and returns its canonical Workspace URN for message persistence. */
export async function uploadFile(file: File, options?: UploadFileOptions): Promise<string> {
  ensureMessengerApiReady();
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(t("app.noInstance"));
  }
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error ?? "File validation failed");
  }

  const streamUuid = guard.streamUuid(options?.streamUuid, "uploadFile.streamUuid");
  return uploadWorkspaceFileMultipart(file, streamUuid, options);
}
