import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  adaptMessengerFolder,
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { useMessengerStore } from "./messenger.model";

export interface MessengerRealtimeActiveApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

export interface MessengerRealtimeBackgroundApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

const log = createLogger("realtime:workspace-messenger");

function isActiveCurrentOwner(
  context: WorkspaceRealtimeEventContext,
  options: MessengerRealtimeActiveApplierOptions,
): boolean {
  if (context.surface !== "active") return false;
  if (context.signal?.aborted === true) return false;

  // ownerKey does not include runtimeGeneration, so check stale sockets before any store write.
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

function isBackgroundCurrentOwner(
  context: WorkspaceRealtimeEventContext,
  options: MessengerRealtimeBackgroundApplierOptions,
): boolean {
  if (context.surface !== "background") return false;
  if (context.signal?.aborted === true) return false;

  // Background runtime can live for several org/projects, so owner checks stay equally strict.
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

function eventKind(event: { type?: unknown; kind?: unknown }): string {
  if (typeof event.kind === "string") {
    return event.kind;
  }

  return typeof event.type === "string" ? event.type : "unknown";
}

function isSupportedRealtimeEvent(event: WorkspaceRealtimeEvent): boolean {
  const eventType = (event as { type?: unknown }).type;
  return (
    eventType === "message" ||
    eventType === "stream" ||
    eventType === "stream_binding" ||
    eventType === "topic" ||
    eventType === "folder" ||
    eventType === "folder_item"
  );
}

function isBackgroundLightweightEvent(event: WorkspaceRealtimeEvent): boolean {
  // stream_binding is not stored in background yet: it contains membership data, not a lightweight id/counter snapshot.
  return event.type !== "stream_binding";
}

function skippedEpoch(event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent): number {
  return event.epoch_version;
}

function removeTopicMessagesFromWorkspaceStore(streamUuid: string, topicUuid: string): void {
  const messageStore = useWorkspaceMessageStore.getState();
  const conversationIds = [
    conversationIdForStream(streamUuid),
    conversationIdForTopic(streamUuid, topicUuid),
  ];
  for (const message of Object.values(messageStore.messagesById)) {
    if (message.streamUuid !== streamUuid || message.topicUuid !== topicUuid) continue;
    messageStore.removeMessage(message.uuid, { conversationIds });
  }
}

export function createMessengerRealtimeActiveApplier(
  options: MessengerRealtimeActiveApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      const store = useMessengerStore.getState();
      const messageStore = useWorkspaceMessageStore.getState();
      if (!isSupportedRealtimeEvent(event)) {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          kind: eventKind(event),
          epochVersion: event.epoch_version,
        });
        // Unknown events also move the visible realtime cursor; the durable cursor is moved by transport.
        store.markRealtimeEventSkipped(context.ownerKey, event.epoch_version, "unsupported_event");
        return;
      }

      switch (event.type) {
        case "message": {
          if (event.kind === "message.deleted") {
            messageStore.removeMessage(event.message.uuid);
            store.clearMessagePointer(context.ownerKey, {
              uuid: event.message.uuid,
              streamUuid: event.message.stream_uuid,
              topicUuid: event.message.topic_uuid,
            });
            break;
          }

          {
            const message = adaptMessengerMessage(event.message);
            messageStore.upsertMessage(message);
            store.applyMessagePointer(context.ownerKey, message);
          }
          break;
        }
        case "stream": {
          if (event.kind === "stream.deleted") {
            store.removeStream(context.ownerKey, { uuid: event.stream.uuid });
            break;
          }

          store.upsertStream(context.ownerKey, adaptMessengerStream(event.stream));
          break;
        }
        case "stream_binding":
          store.upsertStreamBindings(
            context.ownerKey,
            event.stream_bindings.map(adaptMessengerStreamBinding),
          );
          break;
        case "topic": {
          if (event.kind === "topic.deleted") {
            removeTopicMessagesFromWorkspaceStore(event.topic.stream_uuid, event.topic.uuid);
            store.removeTopic(context.ownerKey, {
              uuid: event.topic.uuid,
              streamUuid: event.topic.stream_uuid,
            });
            break;
          }

          store.upsertTopic(context.ownerKey, adaptMessengerTopic(event.topic));
          break;
        }
        case "folder": {
          if (event.kind === "folder.deleted") {
            store.removeFolder(context.ownerKey, { uuid: event.folder.uuid });
            break;
          }

          store.applyFolderSnapshot(context.ownerKey, adaptMessengerFolder(event.folder));
          break;
        }
        case "folder_item":
          store.removeFolderItem(
            context.ownerKey,
            { uuid: event.folder_item.uuid },
            { preserveFolderUnreadCount: true },
          );
          break;
      }

      store.setRealtimeCursor(context.ownerKey, event.epoch_version);
    },

    skipEvent(event, reason: WorkspaceRealtimeSkipReason, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      if (reason === "unsupported_event") {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          epochVersion: skippedEpoch(event),
        });
      }

      useMessengerStore
        .getState()
        .markRealtimeEventSkipped(context.ownerKey, skippedEpoch(event), reason);
    },

    onTransportStateChange() {
      // The active apply path does not store diagnostics in messengerStore yet.
    },
  };
}

export function createMessengerRealtimeBackgroundApplier(
  options: MessengerRealtimeBackgroundApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (!isBackgroundCurrentOwner(context, options)) return;

      const store = useMessengerBackgroundProjectionStore.getState();
      if (!isSupportedRealtimeEvent(event)) {
        store.recordSkippedEvent(context.ownerKey, event, "unsupported_event", context);
        return;
      }

      // Background projection stores only lightweight id snapshots and counters.
      // It has no notification side effects or messengerStore writes, so background does not become a second active path.
      if (isBackgroundLightweightEvent(event)) {
        store.recordAppliedEvent(context.ownerKey, event, context);
        return;
      }

      store.recordSkippedEvent(context.ownerKey, event, "background_apply_deferred", context);
    },

    skipEvent(event, reason, context) {
      if (!isBackgroundCurrentOwner(context, options)) return;

      useMessengerBackgroundProjectionStore
        .getState()
        .recordSkippedEvent(context.ownerKey, event, reason, context);
    },

    onTransportStateChange(state, context) {
      if (context.surface !== "background") return;
      if (context.signal?.aborted === true) return;
      if (!(options.isOwnerCurrent?.(context.owner) ?? true)) return;

      useMessengerBackgroundProjectionStore.getState().recordTransportState(state);
    },
  };
}
