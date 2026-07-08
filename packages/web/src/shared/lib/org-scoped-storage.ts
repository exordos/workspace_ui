/**
 * Helpers for organization-scoped localStorage keys.
 *
 * Uses the active runtime instance id as organization scope for user preferences.
 */
const CURRENT_INSTANCE_STORAGE_KEY = "workspace-runtime-current-instance";

export function getActiveOrganizationIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CURRENT_INSTANCE_STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function buildOrgScopedStorageKey(baseKey: string, organizationId: string | null): string {
  if (organizationId == null || organizationId.length === 0) {
    return baseKey;
  }
  return `${baseKey}:${organizationId}`;
}
