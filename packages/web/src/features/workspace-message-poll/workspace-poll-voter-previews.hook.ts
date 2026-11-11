import { useEffect, useState } from "react";
import { getMessengerPollVoters } from "~/entities/messenger/messenger-poll-actions.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspacePollQuestion } from "./workspace-message-poll.types";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

export function pollVoterOptionKey(questionUuid: string, optionUuid: string) {
  return `${questionUuid}:${optionUuid}`;
}

export function usePollVoterPreviews(
  messageUuid: string,
  revision: number | undefined,
  questions: readonly WorkspacePollQuestion[],
) {
  const generation = useWorkspaceAuthStore((state) => state.runtimeGeneration);
  const key = `${messageUuid}:${revision}:${generation}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    options: Readonly<Record<string, readonly string[]>>;
  }>();

  useEffect(() => {
    const jobs = questions.flatMap((question) =>
      question.options
        .filter((option) => option.votes > 0 && !option.previewVoterUuids?.length)
        .map((option) => ({ questionUuid: question.id, optionUuid: option.id })),
    );
    if (jobs.length === 0) return;
    const context = getRuntimeContext();
    if (!context) return;
    const guard = captureWorkspaceRuntimeRequestContext(getRuntimeContext);
    const controller = new AbortController();
    const stale = () =>
      controller.signal.aborted ||
      isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext, controller.signal);
    const load = async () => {
      for (let job = jobs.shift(); job && !stale(); job = jobs.shift()) {
        try {
          const { questionUuid, optionUuid } = job;
          const result = await getMessengerPollVoters({
            runtimeContext: context,
            getRuntimeContext,
            messageUuid,
            questionUuid,
            optionUuid,
            pageLimit: 5,
            signal: controller.signal,
          });
          if (stale()) return;
          const userUuids = result.items.map((item) => item.uuid);
          setLoaded((previous) => ({
            key,
            options: {
              ...(previous?.key === key ? previous.options : {}),
              [pollVoterOptionKey(questionUuid, optionUuid)]: userUuids,
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
  }, [questions, messageUuid, key]);

  return loaded?.key === key ? loaded.options : undefined;
}
