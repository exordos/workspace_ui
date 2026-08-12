import {
  messengerDeleteJson,
  messengerRequestBinaryResult,
  messengerRequestFormDataResult,
  parseDto,
} from "./messenger-transport.internal";
import { messengerUploadFormDataResult } from "./messenger-upload.internal";
import type { MessengerBinaryResult, MessengerClientOptions } from "./messenger-transport.internal";

export interface WorkspaceFileMetadata {
  uuid: string;
  name: string;
  content_type: string;
  size_bytes: number;
  stream_uuid?: string;
  description?: string;
  hash?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UploadWorkspaceFileInput {
  file: File;
  streamUuid: string;
  name?: string;
  description?: string;
}

export interface WorkspaceFileUploadProgress {
  loaded: number;
  total: number;
}

export interface UploadWorkspaceFileWithProgressInput extends UploadWorkspaceFileInput {
  onProgress?: (progress: WorkspaceFileUploadProgress) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isWorkspaceFileMetadata(value: unknown): value is WorkspaceFileMetadata {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    typeof value.name === "string" &&
    typeof value.content_type === "string" &&
    isNonNegativeInteger(value.size_bytes) &&
    isOptionalString(value.stream_uuid) &&
    isOptionalString(value.description) &&
    isOptionalString(value.hash) &&
    isOptionalString(value.created_at) &&
    isOptionalString(value.updated_at)
  );
}

export async function downloadWorkspaceFile(
  options: MessengerClientOptions,
  fileUuid: string,
): Promise<MessengerBinaryResult> {
  return messengerRequestBinaryResult(
    `/files/${encodeURIComponent(fileUuid)}/actions/download`,
    options,
  );
}

export async function uploadWorkspaceFile(
  options: MessengerClientOptions,
  input: UploadWorkspaceFileInput,
): Promise<WorkspaceFileMetadata> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("stream_uuid", input.streamUuid);
  if (input.name !== undefined) {
    form.append("name", input.name);
  }
  if (input.description !== undefined) {
    form.append("description", input.description);
  }

  const { data } = await messengerRequestFormDataResult("/files/", options, form);
  return parseDto(data, isWorkspaceFileMetadata, "workspace file upload response");
}

export async function uploadWorkspaceFileWithProgress(
  options: MessengerClientOptions,
  input: UploadWorkspaceFileWithProgressInput,
): Promise<WorkspaceFileMetadata> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("stream_uuid", input.streamUuid);
  if (input.name !== undefined) {
    form.append("name", input.name);
  }
  if (input.description !== undefined) {
    form.append("description", input.description);
  }

  const { data } = await messengerUploadFormDataResult("/files/", options, form, input.onProgress);
  return parseDto(data, isWorkspaceFileMetadata, "workspace file upload response");
}

export async function deleteWorkspaceFile(
  options: MessengerClientOptions,
  fileUuid: string,
): Promise<void> {
  await messengerDeleteJson(`/files/${encodeURIComponent(fileUuid)}`, options);
}
