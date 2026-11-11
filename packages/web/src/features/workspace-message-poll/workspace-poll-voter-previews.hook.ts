import { useEffect, useState } from "react";
import { getMessengerPollVoters } from "~/entities/messenger/messenger-poll-actions.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

export function usePollVoterPreviews(
  message: MessengerMessage,
  enabled: boolean,
  deadlineReached?: boolean,
) {
  const generation = useWorkspaceAuthStore((state) => state.runtimeGeneration);
  const payload = message.payload;
  const state = message.pollState;
  const key = `${message.uuid}:${state?.revision}:${generation}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    options: Readonly<Record<string, readonly string[]>>;
  }>();

  useEffect(() => {
    if (!enabled || payload.kind !== "poll" || payload.isAnonymous || !state) return;
    const context = getRuntimeContext();
    if (!context) return;
    const guard = captureWorkspaceRuntimeRequestContext(getRuntimeContext);
    const controller = new AbortController();
    const closed =
      state.isClosed ||
      deadlineReached === true ||
      (payload.closesAt != null && Date.parse(payload.closesAt) <= Date.now());
    const jobs = payload.questions.flatMap((question) => {
      const answered = state.myVotes.some(
        (vote) => vote.questionUuid === question.uuid && vote.optionUuids.length > 0,
      );
      if (payload.resultsVisibility !== "always" && !closed && !answered) return [];
      const counts = state.questions.find((item) => item.questionUuid === question.uuid);
      return question.options
        .filter((option) => (counts?.optionCounts[option.uuid] ?? 0) > 0)
        .map((option) => ({ questionUuid: question.uuid, optionUuid: option.uuid }));
    });
    const stale = () =>
      controller.signal.aborted ||
      isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext, controller.signal);
    const load = async () => {
      for (let job = jobs.shift(); job && !stale(); job = jobs.shift()) {
        try {
          const result = await getMessengerPollVoters({
            runtimeContext: context,
            getRuntimeContext,
            messageUuid: message.uuid,
            ...job,
            pageLimit: 5,
            signal: controller.signal,
          });
          if (stale()) return;
          const optionUuid = job.optionUuid;
          const userUuids = result.items.map((item) => item.uuid);
          setLoaded((previous) => ({
            key,
            options: {
              ...(previous?.key === key ? previous.options : {}),
              [optionUuid]: userUuids,
            },
          }));
        } catch {
          // Counts and the explicit voter list remain available if previews fail.
        }
      }
    };
    // Bound per-bubble requests even for polls with many questions and options.
    const workers = Math.min(3, jobs.length);
    for (let index = 0; index < workers; index++) void load();
    return () => controller.abort();
  }, [enabled, payload, state, message.uuid, key, deadlineReached]);

  return enabled && payload.kind === "poll" && !payload.isAnonymous && loaded?.key === key
    ? loaded.options
    : undefined;
}
