import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { isWorkspaceRealtimeEventApplicationStale } from "./workspace-realtime-application.lib";
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
      const results = await Promise.all(
        appliers.map((applier) => Promise.resolve(applier.applyEvent(event, context))),
      );
      return results.some(isWorkspaceRealtimeEventApplicationStale) ? "stale" : "applied";
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
