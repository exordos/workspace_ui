import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { useActivityStore, type ActivityUnreadMentionMutation } from "./activity.model";

export interface ActivityRealtimeApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

function isCurrentActiveOwner(
  context: WorkspaceRealtimeEventContext,
  options: ActivityRealtimeApplierOptions,
): boolean {
  return (
    context.surface === "active" &&
    context.signal?.aborted !== true &&
    (options.isOwnerCurrent?.(context.owner) ?? true)
  );
}

function activityMutationForEvent(
  event: WorkspaceRealtimeEvent,
): ActivityUnreadMentionMutation | null {
  if (event.type === "messages") {
    return {
      kind: "read-exact",
      epochVersion: event.epoch_version,
      uuids: event.messageUuids,
    };
  }

  if (event.type === "message") {
    if (event.kind === "message.deleted") {
      return {
        kind: "delete",
        epochVersion: event.epoch_version,
        uuid: event.message.uuid,
      };
    }
    if (event.kind === "message.read") {
      return {
        kind: "read-boundary",
        epochVersion: event.epoch_version,
        streamUuid: event.message.stream_uuid,
        topicUuid: event.message.topic_uuid,
        createdAt: event.message.created_at,
        uuid: event.message.uuid,
      };
    }
    if (event.message.read) {
      return {
        kind: "delete",
        epochVersion: event.epoch_version,
        uuid: event.message.uuid,
      };
    }
    if (event.message.mentioned === true) {
      return {
        kind: "upsert",
        epochVersion: event.epoch_version,
        mention: {
          uuid: event.message.uuid,
          streamUuid: event.message.stream_uuid,
          topicUuid: event.message.topic_uuid,
          createdAt: event.message.created_at,
        },
      };
    }
    return event.message.mentioned === false
      ? { kind: "delete", epochVersion: event.epoch_version, uuid: event.message.uuid }
      : null;
  }

  if (event.type === "topic" && (event.kind === "topic.read" || event.kind === "topic.deleted")) {
    return {
      kind: "clear-topic",
      epochVersion: event.epoch_version,
      streamUuid: event.topic.stream_uuid,
      topicUuid: event.topic.uuid,
    };
  }

  if (
    event.type === "stream" &&
    (event.kind === "stream.read" || event.kind === "stream.deleted")
  ) {
    return {
      kind: "clear-stream",
      epochVersion: event.epoch_version,
      streamUuid: event.stream.uuid,
    };
  }

  return null;
}

export function createActivityRealtimeApplier(
  options: ActivityRealtimeApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (!isCurrentActiveOwner(context, options)) return;
      const mutation = activityMutationForEvent(event);
      if (mutation == null) return;

      useActivityStore
        .getState()
        .applyUnreadMentionMutation(context.ownerKey, context.owner.runtimeGeneration, mutation);
    },
    skipEvent() {},
    onTransportStateChange() {},
  };
}
