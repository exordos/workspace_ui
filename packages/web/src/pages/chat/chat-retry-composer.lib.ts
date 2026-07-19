import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";

export function buildChatComposerIdentity(options: {
  route: string;
  draftUuid: string | null;
  editMessageId: MessageId | null;
}): string {
  const mode = options.editMessageId == null ? "write" : `edit:${options.editMessageId}`;
  return `${options.route}\u0000${options.draftUuid ?? "unsaved"}\u0000${mode}`;
}

export function shouldClearComposerAfterRetry(options: {
  attempt: NonNullable<MockMessage["local_composer_attempt"]>;
  currentComposerIdentity: string;
  currentContent: string;
  isEditing: boolean;
}): boolean {
  return (
    !options.isEditing &&
    options.attempt.composerIdentity === options.currentComposerIdentity &&
    options.attempt.content === options.currentContent
  );
}
