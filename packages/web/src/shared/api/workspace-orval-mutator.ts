/**
 * Bridges Orval-generated Workspace API calls to `workspaceApi` (middleware pipeline).
 */

import { setWorkspaceApiMutator } from "workspace-api/workspace-api-mutator";
import { refreshWorkspaceApiBase, workspaceApi } from "./client";
import type { ApiResponse } from "./client";

export class WorkspaceApiHttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "WorkspaceApiHttpError";
    this.status = status;
    this.data = data;
  }
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (headers == null) {
    return null;
  }
  const lower = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(lower);
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === lower);
    return found?.[1] ?? null;
  }
  const record = headers;
  const key = Object.keys(record).find((k) => k.toLowerCase() === lower);
  return key ? (record[key] ?? null) : null;
}

function contentTypeIsJson(headers: HeadersInit | undefined): boolean {
  const ct = headerValue(headers, "Content-Type");
  return !!ct?.toLowerCase().includes("application/json");
}

function contentTypeIsForm(headers: HeadersInit | undefined): boolean {
  const ct = headerValue(headers, "Content-Type");
  return !!ct?.toLowerCase().includes("application/x-www-form-urlencoded");
}

function assertOk(res: ApiResponse): void {
  if (res.ok) {
    return;
  }
  const statusText = res.raw?.statusText ? ` ${res.raw.statusText}` : "";
  throw new WorkspaceApiHttpError(`Workspace API error: ${res.status}${statusText}`, res.status, res.data);
}

export async function workspaceOrvalMutator<T>(url: string, init: RequestInit): Promise<T> {
  if (import.meta.env.DEV) {
    refreshWorkspaceApiBase();
  }
  const method = (init.method ?? "GET").toUpperCase();
  const signal = init.signal ?? undefined;

  if (method === "GET") {
    const res = await workspaceApi.get(url, undefined, signal);
    assertOk(res);
    return (res.data ?? undefined) as T;
  }

  if (method === "DELETE") {
    const res = await workspaceApi.delete(url);
    assertOk(res);
    return (res.data ?? undefined) as T;
  }

  if (method === "POST") {
    if (contentTypeIsJson(init.headers)) {
      const body =
        typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : init.body;
      const res = await workspaceApi.postJson(url, body);
      assertOk(res);
      return (res.data ?? undefined) as T;
    }
    if (contentTypeIsForm(init.headers) && init.body instanceof URLSearchParams) {
      const obj: Record<string, string> = {};
      init.body.forEach((value, key) => {
        obj[key] = value;
      });
      const res = await workspaceApi.post(url, obj, signal);
      assertOk(res);
      return (res.data ?? undefined) as T;
    }
    if (init.body === undefined || init.body === null) {
      const res = await workspaceApi.post(url, {}, signal);
      assertOk(res);
      return (res.data ?? undefined) as T;
    }
    throw new Error(`workspaceOrvalMutator: unsupported POST body for ${url}`);
  }

  if (method === "PUT") {
    if (contentTypeIsJson(init.headers)) {
      const body =
        typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : init.body;
      const res = await workspaceApi.putJson(url, body);
      assertOk(res);
      return (res.data ?? undefined) as T;
    }
    throw new Error(`workspaceOrvalMutator: unsupported PUT body for ${url}`);
  }

  throw new Error(`workspaceOrvalMutator: unsupported method ${method} for ${url}`);
}

/** Wire Orval client to `workspaceApi`. Call once at app bootstrap. */
export function registerWorkspaceOrvalMutator(): void {
  setWorkspaceApiMutator(workspaceOrvalMutator);
}
