import type { ZulipInstance } from "~/entities/instance/instance.model";
import type { ZulipCredentials, ZulipEvent } from "~/shared/api/zulip.types";

export interface StartCredentialEventLoopOptions {
  credentials: ZulipCredentials;
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  onReconnect?: () => void;
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
