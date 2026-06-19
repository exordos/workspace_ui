import type { WorkspaceInstance } from "~/entities/instance/instance.model";

export interface StartInactiveInstanceUnreadPollingOptions {
  instances: readonly WorkspaceInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  fetchUnreadCount: (instance: WorkspaceInstance, signal: AbortSignal) => Promise<number | null>;
  fetchDmUnreadCount: (instance: WorkspaceInstance, signal: AbortSignal) => Promise<number | null>;
  setUnreadCount: (instanceId: string, unreadCount: number) => void;
  setDmUnreadCount: (instanceId: string, dmUnreadCount: number) => void;
  onError?: (instanceId: string, error: unknown) => void;
  pollIntervalMs?: number;
}
