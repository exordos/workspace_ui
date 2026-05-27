import type { ZulipInstance } from "~/entities/instance/instance.model";
import type { RegisterQueueResult, ZulipCredentials, ZulipEvent } from "~/shared/api/zulip.types";

export interface StartCredentialEventLoopOptions {
  credentials: ZulipCredentials;
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  /** Called after the event queue is registered or re-registered successfully. */
  onQueueReady?: () => void;
  onQueueRegistered?: (queueId: string, registration?: RegisterQueueResult) => void;
}

export type StartCredentialEventLoopFn = (options: StartCredentialEventLoopOptions) => () => void;

export interface StartInactiveInstanceEventStreamsOptions {
  instances: readonly ZulipInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  refreshUnreadForInstance: (instance: ZulipInstance) => Promise<void> | void;
  startEventLoop: StartCredentialEventLoopFn;
  onError?: (instanceId: string, error: unknown) => void;
  debounceMs?: number;
}
