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

      // External chats have no owner-scoped IndexedDB projection yet. Background events
      // still advance the shared realtime cursor, while the next active dialog GET hydrates
      // its account-scoped snapshot.
      if (options.surface === "background") return;

      const snapshot = event.external_chat;
      const scopeKey = externalChatScopeKeyForOwner(
        context.ownerKey,
        snapshot.external_account_uuid,
      );
      const store = useExternalChatsStore.getState();
      if (event.kind === "external_chat.deleted") {
        store.remove(scopeKey, snapshot.external_account_uuid, snapshot.uuid, snapshot.revision);
        return;
      }
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
