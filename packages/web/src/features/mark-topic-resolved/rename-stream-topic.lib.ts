import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { isTopicResolved, toResolvedTopicName } from "~/shared/lib/topic-resolve";

/** Maps user input to the Zulip topic string, preserving resolved checkmark when applicable. */
export function resolveRenamedTopicName(
  currentTopic: string,
  nextNameInput: string,
): string | null {
  const nextBase = nextNameInput.trim();
  if (nextBase.length === 0) {
    return null;
  }
  if (isTopicResolved(currentTopic)) {
    return toResolvedTopicName(nextBase);
  }
  return nextBase;
}

export function isTopicRenameUnchanged(currentTopic: string, nextNameInput: string): boolean {
  const nextTopic = resolveRenamedTopicName(currentTopic, nextNameInput);
  if (nextTopic == null) {
    return true;
  }
  return normalizeTopicForIdentity(nextTopic) === normalizeTopicForIdentity(currentTopic);
}
