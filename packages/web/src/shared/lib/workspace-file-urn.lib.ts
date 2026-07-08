import { MESSENGER_WORKSPACE_API_PATH } from "~/shared/config/workspace-api-layout";

const WORKSPACE_FILE_URN_RE =
  /^urn:(image|video|file):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?([\s\S]*))?$/i;

export type WorkspaceFileUrnKind = "image" | "video" | "file";

export interface WorkspaceFileUrn {
  kind: WorkspaceFileUrnKind;
  fileUuid: string;
  downloadPath: string;
  name: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}

function readOptionalString(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim();
  return value != null && value.length > 0 ? value : null;
}

function readPositiveInt(params: URLSearchParams, name: string): number | null {
  const value = readOptionalString(params, name);
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export function buildWorkspaceFileDownloadPath(fileUuid: string): string {
  return `${MESSENGER_WORKSPACE_API_PATH}/files/${fileUuid}/actions/download`;
}

export function parseWorkspaceFileUrn(value: string): WorkspaceFileUrn | null {
  const match = WORKSPACE_FILE_URN_RE.exec(value.trim().replace(/&amp;/gi, "&"));
  if (match == null) return null;

  const kind = match[1]?.toLowerCase() as WorkspaceFileUrnKind | undefined;
  const fileUuid = match[2]?.toLowerCase();
  if (kind == null || fileUuid == null) return null;

  const params = new URLSearchParams(match[3] ?? "");
  return {
    kind,
    fileUuid,
    downloadPath: buildWorkspaceFileDownloadPath(fileUuid),
    name: readOptionalString(params, "name"),
    contentType: readOptionalString(params, "content_type"),
    width: readPositiveInt(params, "w"),
    height: readPositiveInt(params, "h"),
    sizeBytes: readPositiveInt(params, "size"),
  };
}
