import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
  WorkspaceRealtimeTransportState,
} from "./workspace-realtime-runtime.lib";

export function composeWorkspaceRealtimeAppliers(
  appliers: readonly WorkspaceRealtimeEventApplier[],
): WorkspaceRealtimeEventApplier {
  return {
    async applyEvent(event: WorkspaceRealtimeEvent, context: WorkspaceRealtimeEventContext) {
      await Promise.all(appliers.map((applier) => applier.applyEvent(event, context)));
    },
    async skipEvent(
      event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
      reason: WorkspaceRealtimeSkipReason,
      context: WorkspaceRealtimeEventContext,
    ) {
      await Promise.all(appliers.map((applier) => applier.skipEvent(event, reason, context)));
    },
    async onTransportStateChange(
      state: WorkspaceRealtimeTransportState,
      context: WorkspaceRealtimeRuntimeContext,
    ) {
      await Promise.all(appliers.map((applier) => applier.onTransportStateChange(state, context)));
    },
  };
}
