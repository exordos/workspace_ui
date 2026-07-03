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
    applyEvent(event: WorkspaceRealtimeEvent, context: WorkspaceRealtimeEventContext) {
      for (const applier of appliers) {
        applier.applyEvent(event, context);
      }
    },
    skipEvent(
      event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
      reason: WorkspaceRealtimeSkipReason,
      context: WorkspaceRealtimeEventContext,
    ) {
      for (const applier of appliers) {
        applier.skipEvent(event, reason, context);
      }
    },
    onTransportStateChange(
      state: WorkspaceRealtimeTransportState,
      context: WorkspaceRealtimeRuntimeContext,
    ) {
      for (const applier of appliers) {
        applier.onTransportStateChange(state, context);
      }
    },
  };
}
