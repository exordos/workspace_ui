const PENDING_APP_UPDATE_KEY = "workspace-pending-app-update-v1";

interface PendingAppUpdate {
  version: string;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function rememberPendingAppUpdate(
  version: string | undefined,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  const normalizedVersion = version == null ? "" : normalizeVersion(version);
  if (!normalizedVersion) return;

  const pending: PendingAppUpdate = { version: normalizedVersion };
  try {
    storage.setItem(PENDING_APP_UPDATE_KEY, JSON.stringify(pending));
  } catch {
    // Update confirmation is best-effort and must never block installation.
  }
}

export function consumeInstalledAppUpdate(
  currentVersion: string,
  storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage,
): string | null {
  const rawPending = storage.getItem(PENDING_APP_UPDATE_KEY);
  if (rawPending == null) return null;

  storage.removeItem(PENDING_APP_UPDATE_KEY);

  try {
    const parsed = JSON.parse(rawPending) as Partial<PendingAppUpdate>;
    if (typeof parsed.version !== "string") return null;

    const expectedVersion = normalizeVersion(parsed.version);
    const installedVersion = normalizeVersion(currentVersion);
    return expectedVersion && expectedVersion === installedVersion ? installedVersion : null;
  } catch {
    return null;
  }
}
