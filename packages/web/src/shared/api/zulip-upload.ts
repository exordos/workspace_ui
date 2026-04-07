/**
 * Zulip file uploads (TUS + multipart fallback).
 */
import { Buffer } from "buffer";
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { getCurrentInstance, zulipApi } from "./client";
import { env } from "~/shared/lib/env";
import { validateFileUpload } from "~/shared/lib/validation";
import { ensureZulipApiReady } from "./zulip-pipeline.internal";
import type { ZulipCredentials } from "./zulip.types";
import { normalizeRealm } from "./zulip-realm.internal";

const TUS_VERSION = "1.0.0";
const TUS_UPLOAD_THRESHOLD_BYTES = 15 * 1024 * 1024;
const TUS_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

function toUploadUri(data: unknown): string {
  const response = data as { uri?: string; url?: string };
  const uri = response.uri ?? response.url;
  if (!uri) {
    throw new Error("No URI returned from upload");
  }
  return uri;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function buildTusMetadata(file: File): string {
  const encode = (value: string) => Buffer.from(value, "utf-8").toString("base64");
  const parts = [`filename ${encode(file.name)}`];
  if (file.type) {
    parts.push(`type ${encode(file.type)}`);
  }
  return parts.join(",");
}

function resolveTusUploadUrl(locationHeader: string, apiBaseUrl: string): string {
  if (locationHeader.startsWith("http://") || locationHeader.startsWith("https://")) {
    return locationHeader;
  }
  return new URL(locationHeader, `${apiBaseUrl}/`).toString();
}

function parseUploadOffset(headers: Headers): number {
  const raw = headers.get("Upload-Offset") ?? headers.get("upload-offset") ?? "0";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

async function findTusUploadedAttachmentPath(
  apiBaseUrl: string,
  authValue: string,
  expectedName: string,
  expectedSize: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${apiBaseUrl}/attachments`, {
    method: "GET",
    headers: { Authorization: authValue },
    signal,
  });
  if (!res.ok) {
    return null;
  }

  const payload = (await res.json()) as { attachments?: unknown };
  if (!Array.isArray(payload.attachments)) {
    return null;
  }

  let bestMatch: { pathId: string; createTime: number } | null = null;
  for (const item of payload.attachments) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const size = typeof row.size === "number" ? row.size : -1;
    const pathId = typeof row.path_id === "string" ? row.path_id : "";
    const createTime = typeof row.create_time === "number" ? row.create_time : 0;
    if (!pathId || name !== expectedName || size !== expectedSize) continue;
    if (bestMatch == null || createTime > bestMatch.createTime) {
      bestMatch = { pathId, createTime };
    }
  }

  return bestMatch?.pathId ?? null;
}

async function uploadFileViaTus(
  file: File,
  credentials: ZulipCredentials,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (authValue == null) {
    throw new Error(t("app.noInstance"));
  }

  const apiBaseUrl = `${normalizeRealm(credentials.realm)}${env.ZULIP_API_PATH}`;
  const createRes = await fetch(`${apiBaseUrl}/tus`, {
    method: "POST",
    headers: {
      Authorization: authValue,
      "Tus-Resumable": TUS_VERSION,
      "Upload-Length": String(file.size),
      "Upload-Metadata": buildTusMetadata(file),
    },
    signal: options?.signal,
  });
  if (!createRes.ok) {
    throw new Error(t("app.errorStatus", { status: String(createRes.status) }));
  }

  const location = createRes.headers.get("location") ?? createRes.headers.get("Location");
  if (!location) {
    throw new Error("TUS: Location header is missing");
  }
  const uploadUrl = resolveTusUploadUrl(location, apiBaseUrl);

  const headRes = await fetch(uploadUrl, {
    method: "HEAD",
    headers: {
      Authorization: authValue,
      "Tus-Resumable": TUS_VERSION,
    },
    signal: options?.signal,
  });
  if (!headRes.ok) {
    throw new Error(t("app.errorStatus", { status: String(headRes.status) }));
  }

  let offset = parseUploadOffset(headRes.headers);
  while (offset < file.size) {
    const nextOffset = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, nextOffset);
    const patchRes = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        Authorization: authValue,
        "Tus-Resumable": TUS_VERSION,
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "Content-Length": String(chunk.size),
      },
      body: chunk,
      signal: options?.signal,
    });
    if (!patchRes.ok) {
      throw new Error(t("app.errorStatus", { status: String(patchRes.status) }));
    }
    const serverOffset = parseUploadOffset(patchRes.headers);
    offset = serverOffset > offset ? serverOffset : nextOffset;
  }

  const pathId = await findTusUploadedAttachmentPath(
    apiBaseUrl,
    authValue,
    file.name,
    file.size,
    options?.signal,
  );
  if (!pathId) {
    throw new Error("TUS: uploaded file not found in attachments");
  }

  return `/user_uploads/${pathId}`;
}

async function uploadFileMultipart(
  file: File,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res =
    options?.signal != null
      ? await zulipApi.postFormData("/user_uploads", form, options.signal)
      : await zulipApi.postFormData("/user_uploads", form);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return toUploadUri(res.data);
}

/** Uploads a file to Zulip. Uses TUS for large files and multipart fallback otherwise. */
export async function uploadFile(file: File, options?: { signal?: AbortSignal }): Promise<string> {
  ensureZulipApiReady();
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(t("app.noInstance"));
  }
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error ?? "File validation failed");
  }

  const credentials: ZulipCredentials = {
    realm: instance.realm,
    email: instance.email,
    apiKey: instance.apiKey,
  };

  if (file.size > TUS_UPLOAD_THRESHOLD_BYTES) {
    try {
      return await uploadFileViaTus(file, credentials, options);
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }
      // Keep compatibility on servers without TUS support.
      return uploadFileMultipart(file, options);
    }
  }

  return uploadFileMultipart(file, options);
}
