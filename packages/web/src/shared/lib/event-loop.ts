/**
 * Workspace realtime event loop facade.
 *
 * The old Messenger queue transport is not part of the Workspace gateway backend. Realtime
 * bootstrap now happens through explicit gateway fetches; this facade is kept so
 * callers can be simplified incrementally without reintroducing old network traffic.
 */
import type { MessengerCredentials, MessengerEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("realtime");

export interface StartMessengerEventLoopOptions {
  enabled?: boolean;
  onEvent: (event: MessengerEvent) => void;
  onBadQueue?: () => void;
  onQueueReady?: () => void;
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
}

export interface StartMessengerEventLoopForCredentialsOptions extends StartMessengerEventLoopOptions {
  credentials: MessengerCredentials;
}

export function startMessengerEventLoop(_options: StartMessengerEventLoopOptions): void {
  log.info("Messenger event queue transport disabled for Workspace gateway backend");
}

export function startMessengerEventLoopForCredentials(
  _options: StartMessengerEventLoopForCredentialsOptions,
): void {
  log.info("Background messenger event queue transport disabled for Workspace gateway backend");
}
