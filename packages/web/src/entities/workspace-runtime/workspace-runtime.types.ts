import type {
  WorkspaceMessengerEpochVersion,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";

export type WorkspaceAccountId = string;
export type WorkspaceOrganizationId = string;
export type WorkspaceProjectId = string;
export type WorkspaceUserUuid = string;
export type WorkspaceInstanceId = string;

// This owner key is the business boundary for one messenger runtime.
export interface WorkspaceRuntimeOwner {
  accountId: WorkspaceAccountId;
  instanceId: WorkspaceInstanceId;
  organizationId: WorkspaceOrganizationId;
  projectId: WorkspaceProjectId;
  userUuid: WorkspaceUserUuid;
}

export interface WorkspaceRuntimeContext extends WorkspaceRuntimeOwner {
  organizationOrigin: string;
  accessToken: string;
  refreshToken?: string;
  runtimeGeneration: number;
}

// Async requests keep this snapshot so stale responses cannot update another project.
export interface WorkspaceRuntimeRequestContext extends WorkspaceRuntimeOwner {
  runtimeGeneration: number;
}

// Realtime owner описывает один живой project-runtime.
// account/instance/org/project/user разделяют данные, а runtimeGeneration режет устаревшие callbacks.
export interface WorkspaceRealtimeRuntimeOwner extends WorkspaceRuntimeOwner {
  runtimeGeneration: number;
}

// Surface отвечает только за способ применения событий.
// Transport core общий: active и background не должны становиться двумя разными сокет-стеками.
export type WorkspaceRealtimeSurface = "active" | "background";

export type WorkspaceRealtimeRuntimeMode =
  | "idle"
  | "starting"
  | "catching_up"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "stopped"
  | "failed";

export type WorkspaceRealtimeEventSource = "catch_up" | "websocket";

export type WorkspaceRealtimeSkipReason =
  | "duplicate_epoch"
  | "unsupported_event"
  | "stale_owner"
  | "invalid_frame"
  | "background_apply_deferred"
  | "transport_stopped";

export type WorkspaceRealtimeMaybePromise<T> = T | Promise<T>;

export interface WorkspaceRealtimeRuntimeContext {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  signal?: AbortSignal;
}

export interface WorkspaceRealtimeEventContext extends WorkspaceRealtimeRuntimeContext {
  source: WorkspaceRealtimeEventSource;
}

export interface WorkspaceRealtimeTransportState {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  mode: WorkspaceRealtimeRuntimeMode;
  lastEpochVersion: WorkspaceMessengerEpochVersion | null;
  reconnectAttempt: number;
  reason?: string;
  error?: unknown;
}

export interface WorkspaceRealtimeTransportCore {
  start(context: WorkspaceRealtimeRuntimeContext): WorkspaceRealtimeMaybePromise<void>;
  stop(reason?: string): WorkspaceRealtimeMaybePromise<void>;
  catchUp(context: WorkspaceRealtimeRuntimeContext): WorkspaceRealtimeMaybePromise<void>;
  connect(context: WorkspaceRealtimeRuntimeContext): WorkspaceRealtimeMaybePromise<void>;
  disconnect(reason?: string): WorkspaceRealtimeMaybePromise<void>;
  nudge(reason?: string): WorkspaceRealtimeMaybePromise<void>;
  reconnect(reason?: string): WorkspaceRealtimeMaybePromise<void>;
}

export interface WorkspaceRealtimeSkippedEvent {
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceRealtimeEventApplier {
  // Здесь начинается доменное применение: active может писать в messengerStore, background должен идти в свой слой.
  applyEvent(
    event: WorkspaceRealtimeEvent,
    context: WorkspaceRealtimeEventContext,
  ): WorkspaceRealtimeMaybePromise<void>;
  skipEvent(
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
    reason: WorkspaceRealtimeSkipReason,
    context: WorkspaceRealtimeEventContext,
  ): WorkspaceRealtimeMaybePromise<void>;
  onTransportStateChange(
    state: WorkspaceRealtimeTransportState,
    context: WorkspaceRealtimeRuntimeContext,
  ): WorkspaceRealtimeMaybePromise<void>;
}

// Cursor живет по стабильному project-owner без runtimeGeneration.
// Generation проверяется перед записью, но не входит в durable key.
export type WorkspaceRealtimeCursorOwner = WorkspaceRuntimeOwner;

export interface WorkspaceRealtimeCursorStorage {
  read(
    owner: WorkspaceRealtimeCursorOwner,
  ): WorkspaceRealtimeMaybePromise<WorkspaceMessengerEpochVersion | null>;
  write(
    owner: WorkspaceRealtimeCursorOwner,
    epochVersion: WorkspaceMessengerEpochVersion,
  ): WorkspaceRealtimeMaybePromise<void>;
  clear(owner: WorkspaceRealtimeCursorOwner): WorkspaceRealtimeMaybePromise<void>;
}
