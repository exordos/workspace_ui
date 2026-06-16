/**
 * Mail REST client — talks to mail-proxy (/v1/mail/*).
 */

import { env } from "~/shared/lib/env";
import { logApiCall } from "~/shared/lib/logger";
import { detectMailFolderDelimiter } from "./mail-folder-tree.lib";
import { getMailApiBase } from "./mail.lib";
import type {
  MailComposePayload,
  MailCreateFolderInput,
  MailFlagsPatch,
  MailFolder,
  MailFoldersResult,
  MailMessageDetail,
  MailMessageSummary,
  MailMoveFolderInput,
  MailRenameFolderInput,
  MailSessionInfo,
} from "./mail.types";

export class MailApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MailApiError";
    this.status = status;
  }
}

function resolveBaseUrl(): string {
  return getMailApiBase(env.MAIL_API_ORIGIN);
}

async function mailFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const base = resolveBaseUrl();
  if (base.length === 0) {
    throw new Error("Mail API is not configured");
  }
  const { token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("Accept", "application/json");
  if (token != null && token.length > 0) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (fetchOptions.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, { ...fetchOptions, headers });
  } catch (error) {
    logApiCall(fetchOptions.method ?? "GET", path, {
      error: String(error),
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - started);
  logApiCall(fetchOptions.method ?? "GET", path, { status: response.status, durationMs });

  if (!response.ok) {
    let message = `Mail API error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      /* ignore parse errors */
    }
    throw new MailApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function createMailSession(email: string, password: string): Promise<MailSessionInfo> {
  const data = await mailFetch<{
    sessionToken: string;
    expiresAt: string;
    email: string;
  }>("/v1/mail/session", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return {
    token: data.sessionToken,
    expiresAt: data.expiresAt,
    email: data.email,
  };
}

export async function deleteMailSession(token: string): Promise<void> {
  await mailFetch<void>("/v1/mail/session", {
    method: "DELETE",
    token,
  });
}

export async function fetchMailFolders(token: string): Promise<MailFoldersResult> {
  const data = await mailFetch<{ folders: MailFolder[]; delimiter?: string }>("/v1/mail/folders", {
    token,
  });
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const delimiter =
    typeof data.delimiter === "string" && data.delimiter.length > 0
      ? data.delimiter
      : detectMailFolderDelimiter(folders.map((folder) => folder.path));
  return { folders, delimiter };
}

export async function createMailFolder(
  token: string,
  input: MailCreateFolderInput,
  delimiter: string,
): Promise<string> {
  const data = await mailFetch<{ ok: boolean; path: string }>("/v1/mail/folders", {
    method: "POST",
    token,
    body: JSON.stringify({
      name: input.name,
      parentPath: input.parentPath ?? "",
      delimiter,
    }),
  });
  return data.path;
}

export async function renameMailFolder(
  token: string,
  input: MailRenameFolderInput,
  delimiter: string,
): Promise<string> {
  const data = await mailFetch<{ ok: boolean; path: string }>("/v1/mail/folders", {
    method: "PATCH",
    token,
    body: JSON.stringify({ ...input, delimiter }),
  });
  return data.path;
}

export async function moveMailFolder(
  token: string,
  input: MailMoveFolderInput,
  delimiter: string,
): Promise<string> {
  const data = await mailFetch<{ ok: boolean; path: string }>("/v1/mail/folders/move", {
    method: "POST",
    token,
    body: JSON.stringify({ ...input, delimiter }),
  });
  return data.path;
}

export async function deleteMailFolder(
  token: string,
  path: string,
  delimiter: string,
): Promise<void> {
  const params = new URLSearchParams({ path, delimiter });
  await mailFetch<void>(`/v1/mail/folders?${params.toString()}`, {
    method: "DELETE",
    token,
  });
}

export async function clearMailFolder(token: string, path: string): Promise<void> {
  await mailFetch<{ ok: boolean }>("/v1/mail/folders/clear", {
    method: "POST",
    token,
    body: JSON.stringify({ path }),
  });
}

export async function markAllMailFolderRead(token: string, path: string): Promise<void> {
  await mailFetch<{ ok: boolean }>("/v1/mail/folders/mark-all-read", {
    method: "POST",
    token,
    body: JSON.stringify({ path }),
  });
}

export async function fetchMailMessages(
  token: string,
  folder: string,
  limit = 50,
  cursor?: string | null,
): Promise<{ messages: MailMessageSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ folder, limit: String(limit) });
  if (cursor != null && cursor.length > 0) {
    params.set("cursor", cursor);
  }
  const data = await mailFetch<{
    messages: MailMessageSummary[];
    nextCursor: string | null;
  }>(`/v1/mail/messages?${params.toString()}`, { token });
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    nextCursor: data.nextCursor ?? null,
  };
}

export async function fetchMailMessage(
  token: string,
  folder: string,
  uid: number,
  options: { markSeen?: boolean } = {},
): Promise<MailMessageDetail> {
  const params = new URLSearchParams({ folder });
  if (options.markSeen === false) {
    params.set("markSeen", "false");
  }
  const data = await mailFetch<{ message: MailMessageDetail }>(
    `/v1/mail/messages/${uid}?${params.toString()}`,
    { token },
  );
  return data.message;
}

export async function patchMailMessageFlags(
  token: string,
  folder: string,
  uid: number,
  patch: MailFlagsPatch,
): Promise<void> {
  await mailFetch<{ ok: boolean }>(`/v1/mail/messages/${uid}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ folder, ...patch }),
  });
}

export async function deleteMailMessage(token: string, folder: string, uid: number): Promise<void> {
  const params = new URLSearchParams({ folder });
  await mailFetch<void>(`/v1/mail/messages/${uid}?${params.toString()}`, {
    method: "DELETE",
    token,
  });
}

export async function moveMailMessage(
  token: string,
  fromFolder: string,
  toFolder: string,
  uid: number,
): Promise<void> {
  await mailFetch<{ ok: boolean }>(`/v1/mail/messages/${uid}/move`, {
    method: "POST",
    token,
    body: JSON.stringify({ fromFolder, toFolder }),
  });
}

export async function sendMailMessage(token: string, payload: MailComposePayload): Promise<void> {
  await mailFetch<{ ok: boolean }>("/v1/mail/messages", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
