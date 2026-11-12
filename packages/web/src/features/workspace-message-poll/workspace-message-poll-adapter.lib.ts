import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspacePoll, WorkspacePollQuestion } from "./workspace-message-poll.types";

const noVoterQuestions: readonly WorkspacePollQuestion[] = [];

export function visiblePollVoterQuestions(
  poll: WorkspacePoll | null,
  readOnly: boolean,
  deadlineReached = false,
): readonly WorkspacePollQuestion[] {
  if (poll == null || poll.anonymous || readOnly) return noVoterQuestions;
  if (poll.resultsVisibility === "always" || poll.closed || deadlineReached) return poll.questions;
  return poll.questions.filter((question) => question.selectedOptionIds.length > 0);
}

/** Content and counts are projected from the same server snapshot. */
export function toWorkspacePoll(
  messageUuid: string,
  payload: MessengerMessage["payload"],
  state: MessengerMessage["pollState"],
): WorkspacePoll | null {
  if (payload.kind !== "poll" || state == null) return null;
  return {
    kind: "poll",
    id: messageUuid,
    multipleAnswers: payload.multipleAnswers,
    anonymous: payload.isAnonymous,
    allowRevote: payload.allowRevote,
    allowAddingOptions: payload.allowAddingOptions,
    resultsVisibility: payload.resultsVisibility,
    closed: state.isClosed,
    closesAt: payload.closesAt,
    closedAt: payload.closedAt,
    voterCount: state.voterCount,
    questions: payload.questions.map((question) => {
      const counts = state.questions.find((item) => item.questionUuid === question.uuid);
      return {
        id: question.uuid,
        text: question.text,
        voterCount: counts?.voterCount ?? 0,
        selectedOptionIds:
          state.myVotes.find((item) => item.questionUuid === question.uuid)?.optionUuids ?? [],
        correctOptionIds: question.correctOptionUuids,
        options: question.options.map((option) => ({
          id: option.uuid,
          text: option.text,
          votes: counts?.optionCounts[option.uuid] ?? 0,
          previewVoterUuids: counts?.optionVoterPreviews?.[option.uuid],
        })),
      };
    }),
  };
}
