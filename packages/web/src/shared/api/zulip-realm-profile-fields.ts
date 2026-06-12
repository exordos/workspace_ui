/**
 * Zulip GET /realm/profile_fields — custom profile field definitions for the realm.
 *
 * Cached per instance id. Used to interpret `profile_data` keys (job title, manager, person picker).
 */

import { getCurrentInstance, zulipApi } from "~/shared/api/client";
import { createLogger } from "~/shared/lib/logger";
import type { RealmProfileFieldDefinition } from "~/shared/lib/zulip-profile-fields-map.lib";

const log = createLogger("api:realm-profile-fields");

const realmProfileFieldsByInstanceId = new Map<string, RealmProfileFieldDefinition[]>();

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function parseRealmProfileFields(data: unknown): RealmProfileFieldDefinition[] | null {
  if (data == null || typeof data !== "object") return null;
  const body = data as { result?: string; custom_fields?: unknown };
  if (body.result === "error") return null;
  if (!Array.isArray(body.custom_fields)) return [];
  const out: RealmProfileFieldDefinition[] = [];
  for (const row of body.custom_fields) {
    if (row == null || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : Number(r.id);
    const name = typeof r.name === "string" ? r.name : "";
    const type = typeof r.type === "number" ? r.type : Number(r.type);
    const order = typeof r.order === "number" ? r.order : Number(r.order);
    if (
      !Number.isFinite(id) ||
      name.length === 0 ||
      !Number.isFinite(type) ||
      !Number.isFinite(order)
    ) {
      continue;
    }
    out.push({ id, name, type, order });
  }
  return out;
}

/**
 * Loads realm custom profile field definitions (cached per instance).
 * Returns `null` if unauthenticated or the request fails.
 */
export async function fetchRealmProfileFieldDefinitions(): Promise<
  RealmProfileFieldDefinition[] | null
> {
  return fetchRealmProfileFieldDefinitionsWithSignal();
}

export async function fetchRealmProfileFieldDefinitionsWithSignal(
  signal?: AbortSignal,
): Promise<RealmProfileFieldDefinition[] | null> {
  const inst = getCurrentInstance();
  if (inst == null) return null;

  if (realmProfileFieldsByInstanceId.has(inst.id)) {
    return realmProfileFieldsByInstanceId.get(inst.id)!;
  }

  try {
    const res = await zulipApi.get("/realm/profile_fields", undefined, signal);
    if (!res.ok) {
      log.warn("Failed to fetch realm profile fields", { status: res.status });
      return null;
    }
    const parsed = parseRealmProfileFields(res.data);
    if (parsed == null) {
      return null;
    }
    realmProfileFieldsByInstanceId.set(inst.id, parsed);
    return parsed;
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throw err;
    }
    log.warn("Error fetching realm profile fields", { error: String(err) });
    return null;
  }
}

/** Clears cached GET /realm/profile_fields (e.g. after logout in tests). */
export function clearRealmProfileFieldsCache(): void {
  realmProfileFieldsByInstanceId.clear();
}
