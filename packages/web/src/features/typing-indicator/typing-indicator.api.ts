/**
 * Typing indicator API facade.
 *
 * The Workspace gateway backend does not expose a typing notification endpoint. Typing
 * notifications are therefore local/realtime-consumer-only until a new backend contract exists.
 */

import type { UserId } from "~/shared/lib/user-id.lib";

export function sendTypingStart(_userIds: UserId[]): Promise<void> {
  return Promise.resolve();
}

export function sendTypingStop(_userIds: UserId[]): Promise<void> {
  return Promise.resolve();
}

export function sendStreamTypingStart(_streamUuid: string, _topic: string): Promise<void> {
  return Promise.resolve();
}

export function sendStreamTypingStop(_streamUuid: string, _topic: string): Promise<void> {
  return Promise.resolve();
}
