/**
 * Zulip HTTP pipeline helpers (auth middleware client). Internal to shared/api zulip modules.
 */
import { t } from "~/i18n/i18n";
import { getCurrentInstance, refreshWorkspaceApiBase, refreshZulipApiBase, zulipApi } from "./client";

function normalizeApiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function ensureZulipApiReady(): void {
  if (!getCurrentInstance()) {
    throw new Error(t("app.noInstance"));
  }
  refreshZulipApiBase();
  refreshWorkspaceApiBase();
}

export async function zulipPipelineGet(
  path: string,
  params?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  try {
    ensureZulipApiReady();
    const response = await zulipApi.get(normalizeApiPath(path), params);
    return {
      ok: response.ok,
      status: response.status,
      data: response.data,
    };
  } catch {
    return null;
  }
}

export async function zulipPipelinePost(path: string, body: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.post(normalizeApiPath(path), body);
}

export async function zulipPipelinePatch(path: string, body: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.patch(normalizeApiPath(path), body);
}

export async function zulipPipelineDelete(path: string, body?: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.delete(normalizeApiPath(path), body);
}
