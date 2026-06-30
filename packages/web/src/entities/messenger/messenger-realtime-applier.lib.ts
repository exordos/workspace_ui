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

  // ownerKey не содержит runtimeGeneration, поэтому stale socket проверяем до любой записи в store.
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

function isBackgroundCurrentOwner(
  context: WorkspaceRealtimeEventContext,
  options: MessengerRealtimeBackgroundApplierOptions,
): boolean {
  if (context.surface !== "background") return false;
  if (context.signal?.aborted === true) return false;

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
  if (event.type === "folder" && event.kind !== "folder.deleted") return true;
  return (
    event.type === "message" && event.kind !== "message.updated" && event.kind !== "message.deleted"
  );
}

function skippedEpoch(event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent): number {
  return event.epoch_version;
}

export function createMessengerRealtimeActiveApplier(
  options: MessengerRealtimeActiveApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      const store = useMessengerStore.getState();
      if (!isSupportedRealtimeEvent(event)) {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          kind: eventKind(event),
          epochVersion: event.epoch_version,
        });
        // Unknown event тоже двигает видимый realtime cursor, а durable cursor двигает transport.
        store.markRealtimeEventSkipped(context.ownerKey, event.epoch_version, "unsupported_event");
        return;
      }

      switch (event.type) {
        case "message": {
          if (event.kind === "message.deleted") {
            store.removeMessage(context.ownerKey, {
              uuid: event.message.uuid,
              streamUuid: event.message.stream_uuid,
              topicUuid: event.message.topic_uuid,
            });
            break;
          }

          store.upsertMessage(context.ownerKey, adaptMessengerMessage(event.message));
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
      // Active apply path пока не хранит diagnostics в messengerStore.
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

      // Background projection хранит только легкие данные: счетчики и поля для будущих уведомлений.
      // Полное состояние чата остается в active messengerStore, чтобы не смешивать ownership.
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
