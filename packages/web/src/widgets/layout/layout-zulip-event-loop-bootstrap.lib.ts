import { traceDmPreviewHydrate } from "~/entities/chat-list/chat-list-dm-preview-hydrate-trace.lib";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { ZulipUserMember } from "~/shared/api/zulip.types";
import type { createLogger } from "~/shared/lib/logger";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { StreamPreviewsBootstrapResult } from "./layout-metadata-stream-preview-coordinator.lib";

export function createDmPreviewHydrateSettledHandler(options: {
  getCancelled: () => boolean;
  instanceId: string | null;
  source: string;
  persistDmIndexFromStore: (instanceId: string) => void;
}): () => void {
  return () => onDmPreviewHydrateSettled(options);
}

export function createDmPreviewHydrateRejectedHandler(options: {
  source: string;
  log: ReturnType<typeof createLogger>;
}): (error: unknown) => void {
  return (error) => onDmPreviewHydrateRejected({ ...options, error });
}

export function summarizeStreamPreviewsBootstrapMessages(
  result: ChatListBootstrapResult,
): ReturnType<typeof summarizeZulipMessagesForFlowDebug> {
  return summarizeZulipMessagesForFlowDebug(
    result.mode === "streamPreviews" ? result.messages : [],
  );
}

export interface StreamPreviewBootstrapSettledHandlerParams {
  getCancelled: () => boolean;
  isBootstrapStale: () => boolean;
  instanceId: string | null;
  stageMetadataStreamPreviewsBootstrap: (result: StreamPreviewsBootstrapResult) => void;
  applyChatListBootstrapResult: (result: ChatListBootstrapResult, applyOptions: unknown) => void;
  bootstrapApplyOptions: unknown;
  startSidebarUnreadReconcile: (params: {
    cancelled: () => boolean;
    instanceId: string | null;
    currentUserId: number | null;
    registerSnapshot?: ZulipUnreadMessagesSnapshot | null;
  }) => void;
  currentUserId: number | null;
  registerSnapshot: ZulipUnreadMessagesSnapshot | null;
  log: ReturnType<typeof createLogger>;
}

export interface StreamPreviewBootstrapSettledParams extends StreamPreviewBootstrapSettledHandlerParams {
  streamBootstrap: ChatListBootstrapResult;
  summarizeStreamBootstrapMessages: (result: ChatListBootstrapResult) => unknown;
}

export function createStreamPreviewBootstrapSettledHandler(
  options: StreamPreviewBootstrapSettledHandlerParams,
): (streamBootstrap: ChatListBootstrapResult) => void {
  return (streamBootstrap) =>
    onStreamPreviewBootstrapSettled({
      ...options,
      streamBootstrap,
      summarizeStreamBootstrapMessages: summarizeStreamPreviewsBootstrapMessages,
    });
}

export function createStreamPreviewBootstrapRejectedHandler(options: {
  getCancelled: () => boolean;
  isBootstrapStale: () => boolean;
  instanceId: string | null;
  log: ReturnType<typeof createLogger>;
}): (error: unknown) => void {
  return (error) => onStreamPreviewBootstrapRejected({ ...options, error });
}

export function createManualReconnectBootstrapHandler(options: {
  getCancelled: () => boolean;
  attemptResolveCurrentUser: () => Promise<number | null>;
}): () => void {
  return () => {
    if (options.getCancelled()) {
      return;
    }
    void options.attemptResolveCurrentUser();
  };
}

export function createRegisterMuteSnapshotAppliedMarker(target: {
  registerMuteSnapshotApplied: boolean;
}): () => void {
  return () => {
    target.registerMuteSnapshotApplied = true;
  };
}

export function createCurrentUserReconnectRunner(
  attemptResolveCurrentUser: () => Promise<number | null>,
): () => Promise<boolean> {
  return () => resolveCurrentUserIdForReconnect(attemptResolveCurrentUser);
}

export function onDmPreviewHydrateSettled(options: {
  getCancelled: () => boolean;
  instanceId: string | null;
  source: string;
  persistDmIndexFromStore: (instanceId: string) => void;
}): void {
  if (options.getCancelled() || options.instanceId == null) {
    return;
  }
  options.persistDmIndexFromStore(options.instanceId);
  traceDmPreviewHydrate("schedule:persistDmIndexDone", {
    source: options.source,
    instanceId: options.instanceId,
  });
}

export function onDmPreviewHydrateRejected(options: {
  source: string;
  error: unknown;
  log: ReturnType<typeof createLogger>;
}): void {
  traceDmPreviewHydrate("schedule:hydrateRejected", {
    source: options.source,
    error: options.error instanceof Error ? options.error.message : String(options.error),
  });
  options.log.error("DM preview hydrate failed", {
    source: options.source,
    error: options.error instanceof Error ? options.error.message : String(options.error),
  });
}

export async function resolveCurrentUserIdForReconnect(
  attemptResolveCurrentUser: () => Promise<number | null>,
): Promise<boolean> {
  const id = await attemptResolveCurrentUser();
  return id != null;
}

export function findZulipMemberByUserId(
  members: readonly ZulipUserMember[],
  userId: number,
): ZulipUserMember | undefined {
  return members.find((member) => member.user_id === userId);
}

export function onStreamPreviewBootstrapSettled(
  options: StreamPreviewBootstrapSettledParams,
): void {
  if (options.getCancelled() || options.isBootstrapStale()) {
    return;
  }
  logChatListFlow("eventLoop: stream preview batch settled", {
    instanceId: options.instanceId,
    bootstrapMode: options.streamBootstrap.mode,
    bootstrapMessages: options.summarizeStreamBootstrapMessages(options.streamBootstrap),
    latestMessageIdHint: options.streamBootstrap.latestMessageIdHint,
  });
  if (options.streamBootstrap.mode === "streamPreviews") {
    options.stageMetadataStreamPreviewsBootstrap(options.streamBootstrap);
    return;
  }
  options.applyChatListBootstrapResult(options.streamBootstrap, options.bootstrapApplyOptions);
  options.startSidebarUnreadReconcile({
    cancelled: options.getCancelled,
    instanceId: options.instanceId,
    currentUserId: options.currentUserId,
    registerSnapshot: options.registerSnapshot,
  });
}

export function onStreamPreviewBootstrapRejected(options: {
  getCancelled: () => boolean;
  isBootstrapStale: () => boolean;
  instanceId: string | null;
  error: unknown;
  log: ReturnType<typeof createLogger>;
}): void {
  if (options.getCancelled() || options.isBootstrapStale()) {
    return;
  }
  options.log.error("Stream preview bootstrap failed", {
    instanceId: options.instanceId,
    error: options.error instanceof Error ? options.error.message : String(options.error),
  });
}
