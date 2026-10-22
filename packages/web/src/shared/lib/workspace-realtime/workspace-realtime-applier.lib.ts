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
    async applyEvents(events, context) {
      let start = 0;
      while (start < events.length) {
        const first = events[start];
        if (first == null || context.signal?.aborted) return;
        let end = start + 1;
        while (events[end]?.type === first.type && events[end]?.kind === first.kind) end += 1;
        const run = events.slice(start, end);
        // Finish all domains before crossing a mutation-kind boundary. Otherwise
        // a slow applier could process an earlier delete after another domain's create.
        await Promise.all(
          appliers.map(async (applier) => {
            if (applier.applyEvents != null) {
              await applier.applyEvents(run, context);
            } else {
              for (const event of run) {
                if (context.signal?.aborted) return;
                await applier.applyEvent(event, context);
              }
            }
          }),
        );
        start = end;
      }
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
