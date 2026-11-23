export interface PreparedPlaintextRecord {
  readonly cacheKey: string;
  readonly fingerprint: string;
  readonly plaintext: string;
  readonly ownerKey: string;
  readonly deviceId: string;
  readonly streamUuid: string;
  readonly keyUuid: string;
}

const preparedWindows = new Map<string, Map<string, PreparedPlaintextRecord>>();
const MAX_PREPARED_PLAINTEXT = 500;
const MAX_PREPARED_CHARACTERS = 2_000_000;

function windowKey(scope: string, id: string): string {
  return JSON.stringify([scope, id]);
}

export function readPreparedPlaintext(scope: string, id: string, cacheKey: string) {
  return preparedWindows.get(windowKey(scope, id))?.get(cacheKey);
}

export function removePreparedPlaintextWindow(scope: string, id: string) {
  preparedWindows.delete(windowKey(scope, id));
}

export function clearPreparedPlaintextWindows() {
  preparedWindows.clear();
}

export function invalidatePreparedPlaintextWindows(
  change: Pick<PreparedPlaintextRecord, "ownerKey" | "deviceId" | "streamUuid" | "keyUuid">,
) {
  for (const [key, window] of preparedWindows) {
    if (
      [...window.values()].some(
        (cached) =>
          cached.ownerKey === change.ownerKey &&
          cached.deviceId === change.deviceId &&
          cached.streamUuid === change.streamUuid &&
          cached.keyUuid === change.keyUuid,
      )
    )
      preparedWindows.delete(key);
  }
}

/** Replace only a complete current window; an oversized window is never partially retained. */
export function replacePreparedPlaintextWindow(
  scope: string,
  id: string,
  records: readonly PreparedPlaintextRecord[],
) {
  const key = windowKey(scope, id);
  const next = new Map(records.map((record) => [record.cacheKey, record]));
  const size = (window: Map<string, PreparedPlaintextRecord>) => {
    let characters = 0;
    for (const [key, record] of window) characters += key.length + record.plaintext.length;
    return characters;
  };
  const nextCharacters = size(next);
  // A replacement that no longer fits must not leave stale partial history behind.
  if (next.size > MAX_PREPARED_PLAINTEXT || nextCharacters > MAX_PREPARED_CHARACTERS) {
    preparedWindows.delete(key);
    return;
  }
  preparedWindows.delete(key);
  if (!next.size) return;
  let count = next.size;
  let characters = nextCharacters;
  for (const window of preparedWindows.values()) {
    count += window.size;
    characters += size(window);
  }
  while (count > MAX_PREPARED_PLAINTEXT || characters > MAX_PREPARED_CHARACTERS) {
    const oldest = preparedWindows.keys().next().value!;
    const window = preparedWindows.get(oldest)!;
    count -= window.size;
    characters -= size(window);
    preparedWindows.delete(oldest);
  }
  preparedWindows.set(key, next);
}
