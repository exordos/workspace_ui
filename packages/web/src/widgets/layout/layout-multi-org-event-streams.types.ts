import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import type { MessengerCredentials } from "~/shared/api/messenger.types";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";

export interface StartCredentialEventLoopOptions {
  credentials: MessengerCredentials;
  onEvent: (event: WorkspaceEvent) => void;
  onBadQueue?: () => void;
  /** Called after the event queue is registered or re-registered successfully. */
  onQueueReady?: () => void;
}

export type StartCredentialEventLoopFn = (options: StartCredentialEventLoopOptions) => () => void;

export interface StartInactiveInstanceEventStreamsOptions {
  instances: readonly WorkspaceInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  refreshUnreadForInstance: (instance: WorkspaceInstance) => Promise<void> | void;
  startEventLoop: StartCredentialEventLoopFn;
  onError?: (instanceId: string, error: unknown) => void;
  debounceMs?: number;
}
