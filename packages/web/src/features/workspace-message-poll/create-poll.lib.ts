import type { WorkspaceMessengerPollPayloadDto } from "~/shared/api/messenger.types";
import type { PollDraft } from "./create-poll-dialog.ui";

export interface PollSendTarget {
  streamUuid: string;
  topicUuid: string;
  includeStreamConversation: boolean;
}
export interface PollSendAttempt {
  draft: PollDraft;
  uuid: string;
  payload: WorkspaceMessengerPollPayloadDto;
  target: PollSendTarget;
}

export function preparePollSend(draft: PollDraft, target: PollSendTarget): PollSendAttempt {
  const questions = draft.questions.map((question) => {
    const options = question.options.map((option) => ({
      uuid: crypto.randomUUID(),
      text: option.text,
    }));
    const correct = options
      .filter((_, index) => question.options[index]?.correct)
      .map((option) => option.uuid);
    return {
      uuid: crypto.randomUUID(),
      text: question.text,
      options,
      ...(correct.length > 0 ? { correct_option_uuids: correct } : {}),
    };
  });
  return {
    draft,
    target,
    uuid: crypto.randomUUID(),
    payload: {
      kind: "poll",
      questions,
      multiple_answers: draft.multipleAnswers,
      is_anonymous: draft.anonymous,
      allow_revote: draft.allowRevote,
      allow_adding_options: draft.allowAddingOptions,
      results_visibility: draft.resultsVisibility,
      closes_at: draft.closesAt,
    },
  };
}
