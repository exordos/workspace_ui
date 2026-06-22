/**
 * Typing indicator API facade.
 *
 * The Workspace gateway backend does not expose a typing notification endpoint. Typing
 * notifications are therefore local/realtime-consumer-only until a new backend contract exists.
 */

export async function sendTypingStart(_userIds: number[]): Promise<void> {
  return undefined;
}

export async function sendTypingStop(_userIds: number[]): Promise<void> {
  return undefined;
}

export async function sendStreamTypingStart(_streamUuid: string, _topic: string): Promise<void> {
  return undefined;
}

export async function sendStreamTypingStop(_streamUuid: string, _topic: string): Promise<void> {
  return undefined;
}
