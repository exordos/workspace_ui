const WORKSPACE_ORGANIZATION_HISTORY_KEY = "workspace-organization-history-v1";

function organizationOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function readWorkspaceOrganizationHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WORKSPACE_ORGANIZATION_HISTORY_KEY);
    const stored: unknown = raw == null ? null : JSON.parse(raw);
    if (
      stored == null ||
      typeof stored !== "object" ||
      !("version" in stored) ||
      stored.version !== 1 ||
      !("origins" in stored) ||
      !Array.isArray(stored.origins)
    ) {
      return [];
    }
    const origins = stored.origins.map(organizationOrigin).filter((origin) => origin != null);
    return [...new Set(origins)];
  } catch {
    return [];
  }
}

// Call only after a complete login has committed its session.
export function recordSuccessfulWorkspaceOrganization(value: string): void {
  const origin = organizationOrigin(value);
  if (origin == null || typeof window === "undefined") return;
  const origins = [
    origin,
    ...readWorkspaceOrganizationHistory().filter((previous) => previous !== origin),
  ];
  try {
    window.localStorage.setItem(
      WORKSPACE_ORGANIZATION_HISTORY_KEY,
      JSON.stringify({ version: 1, origins }),
    );
  } catch {
    /* Organization suggestions must not prevent login when storage is restricted. */
  }
}
