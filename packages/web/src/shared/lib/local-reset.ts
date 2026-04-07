const CRITICAL_STORAGE_KEYS = [
  "zulip-web-instances",
  "zulip-web-current-instance",
  "workspace-palette",
  "workspace-theme-mode",
  "workspace-settings",
  "workspace-locale",
  "zulip-web-sidebar-config",
  "recent_dm_partners",
  "analytics_consent",
] as const;

const CRITICAL_STORAGE_KEY_PREFIXES = [
  "workspace-palette:",
  "workspace-theme-mode:",
  "workspace-settings:",
  "workspace-locale:",
  "zulip-web-sidebar-config:",
] as const;

function isCriticalStorageKey(key: string): boolean {
  if ((CRITICAL_STORAGE_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  return CRITICAL_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Clears non-critical local storage entries while preserving auth and user preference keys. */
export function clearLocalStatePreservingCriticalKeys(storage: Storage = localStorage): void {
  try {
    const preserved = new Map<string, string>();

    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key != null) keys.push(key);
    }

    for (const key of keys) {
      try {
        if (!isCriticalStorageKey(key)) continue;
        const value = storage.getItem(key);
        if (value != null) preserved.set(key, value);
      } catch {
        // If storage is restricted, keep best-effort behavior and exit cleanly.
        return;
      }
    }

    for (const key of keys) {
      if (!preserved.has(key)) {
        storage.removeItem(key);
      }
    }

    for (const [key, value] of preserved) {
      storage.setItem(key, value);
    }
  } catch {
    // Storage is optional in some runtimes (restricted mode / iframe / tests).
  }
}

export { CRITICAL_STORAGE_KEYS };
