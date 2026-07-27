import { removeMessengerStreamProjection } from "~/entities/messenger/messenger-stream-projection-cleanup.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceExternalChatDto } from "./external-chat-adapters.lib";
import { useExternalChatsStore } from "./external-chat.model";

export interface ExternalChatRealtimeApplierOptions {
  surface: "active" | "background";
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  removeProjection?: typeof removeMessengerStreamProjection;
}

function isCurrentContext(
  context: WorkspaceRealtimeEventContext,
  options: ExternalChatRealtimeApplierOptions,
): boolean {
  return (
    context.surface === options.surface &&
    context.signal?.aborted !== true &&
    (options.isOwnerCurrent?.(context.owner) ?? true)
  );
}

function externalChatScopeKeyForOwner(ownerKey: string, externalAccountUuid: string): string {
  return `${ownerKey}:external-account:${externalAccountUuid}`;
}

export function createExternalChatRealtimeApplier(
  options: ExternalChatRealtimeApplierOptions,
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (event.type !== "external_chat" || !isCurrentContext(context, options)) return;

      const snapshot = event.external_chat;
      const scopeKey = externalChatScopeKeyForOwner(
        context.ownerKey,
        snapshot.external_account_uuid,
      );
      const store = useExternalChatsStore.getState();
      if (event.kind === "external_chat.deleted") {
        const current =
          store.scopeKey === scopeKey &&
          store.externalAccountUuid === snapshot.external_account_uuid
            ? store.chats.find((chat) => chat.uuid === snapshot.uuid)
            : undefined;
        if (current != null && current.revision > snapshot.revision) return;

        if (options.surface === "active") {
          store.remove(scopeKey, snapshot.external_account_uuid, snapshot.uuid, snapshot.revision);
        }
        if (snapshot.projection_stream_uuid != null) {
          void (options.removeProjection ?? removeMessengerStreamProjection)({
            ownerKey: context.ownerKey,
            streamUuid: snapshot.projection_stream_uuid,
            removeActiveProjection: options.surface === "active",
            isOwnerCurrent: () => isCurrentContext(context, options),
          }).catch(() => undefined);
        }
        return;
      }
      // External chats have no owner-scoped IndexedDB projection yet. Background events
      // still advance the shared realtime cursor, while the next active dialog GET hydrates
      // its account-scoped snapshot.
      if (options.surface === "background") return;
      store.upsert(
        scopeKey,
        snapshot.external_account_uuid,
        adaptWorkspaceExternalChatDto(snapshot),
      );
    },
    skipEvent() {},
    onTransportStateChange() {},
  };
}
