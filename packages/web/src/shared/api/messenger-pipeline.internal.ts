/**
 * Workspace HTTP pipeline helpers (auth middleware client). Internal to shared/api messenger modules.
 */
import { t } from "~/i18n/i18n";
import {
  getCurrentInstance,
  refreshWorkspaceApiBase,
  refreshMessengerApiBase,
  messengerApi,
} from "./client";

function normalizeApiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function ensureMessengerApiReady(): void {
  if (!getCurrentInstance()) {
    throw new Error(t("app.noInstance"));
  }
  refreshMessengerApiBase();
  refreshWorkspaceApiBase();
}

export async function messengerPipelineGet(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  try {
    ensureMessengerApiReady();
    const response = await messengerApi.get(normalizeApiPath(path), params, signal);
    return {
      ok: response.ok,
      status: response.status,
      data: response.data,
    };
  } catch {
    return null;
  }
}

export async function messengerPipelinePost(path: string, body: Record<string, string>) {
  ensureMessengerApiReady();
  return messengerApi.post(normalizeApiPath(path), body);
}

export async function messengerPipelinePatch(path: string, body: Record<string, string>) {
  ensureMessengerApiReady();
  return messengerApi.patch(normalizeApiPath(path), body);
}

export async function messengerPipelineDelete(path: string, body?: Record<string, string>) {
  ensureMessengerApiReady();
  return messengerApi.delete(normalizeApiPath(path), body);
}
