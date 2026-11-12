import type { MessengerPollPayload, MessengerPollState } from "./messenger.types";

/** Text only: callers choose a plain snapshot when embedding this in a message. */
export function summarizeMessengerPoll(
  poll: MessengerPollPayload,
  pollState: MessengerPollState | null | undefined,
  now = Date.now(),
): string {
  return poll.questions
    .map((question) => {
      const state = pollState?.questions.find((item) => item.questionUuid === question.uuid);
      const voted =
        (pollState?.myVotes.find((item) => item.questionUuid === question.uuid)?.optionUuids
          .length ?? 0) > 0;
      const showCounts =
        poll.resultsVisibility === "always" ||
        voted ||
        pollState?.isClosed === true ||
        (poll.closesAt != null && Date.parse(poll.closesAt) <= now);
      return [
        question.text,
        ...question.options.map(
          (option) =>
            `• ${option.text}${showCounts && state ? ` (${state.optionCounts[option.uuid] ?? 0})` : ""}`,
        ),
      ].join("\n");
    })
    .join("\n\n");
}
