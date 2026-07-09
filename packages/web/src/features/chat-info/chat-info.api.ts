// Legacy numeric stream info has no reliable Workspace UUID, so this layer stays local-only.
export function loadStreamMembers(
  _instanceId: string,
  _streamId: number,
  _options?: { force?: boolean },
): Promise<number[]> {
  return Promise.resolve([]);
}

export function loadStreamMetadata(
  _instanceId: string,
  _streamId: number,
  _options?: { force?: boolean },
): Promise<{ name: string | null; description: string | null }> {
  return Promise.resolve({
    name: null,
    description: null,
  });
}

export function invalidateStream(_instanceId: string, _streamId: number): void {}

export function invalidateInstance(_instanceId: string): void {}

export function resetChatInfoApiCacheForTests(): void {}
