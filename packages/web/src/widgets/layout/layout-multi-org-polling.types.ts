import type { ZulipInstance } from "~/entities/instance/instance.model";

export interface StartInactiveInstanceUnreadPollingOptions {
  instances: readonly ZulipInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  fetchUnreadCount: (instance: ZulipInstance, signal: AbortSignal) => Promise<number | null>;
  setUnreadCount: (instanceId: string, unreadCount: number) => void;
  onError?: (instanceId: string, error: unknown) => void;
  pollIntervalMs?: number;
}
