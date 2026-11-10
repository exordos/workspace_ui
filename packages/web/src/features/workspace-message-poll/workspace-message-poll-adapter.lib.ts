import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspacePoll } from "./workspace-message-poll.types";

/** Content and counts are projected from the same server snapshot. */
export function toWorkspacePoll(message: MessengerMessage): WorkspacePoll | null {
  const payload = message.payload;
  const state = message.pollState;
  if (payload.kind !== "poll" || state == null) return null;
  return {
    kind: "poll",
    id: message.uuid,
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
        })),
      };
    }),
  };
}
