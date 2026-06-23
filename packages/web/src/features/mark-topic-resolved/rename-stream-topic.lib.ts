import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

/** Maps user input to the Workspace topic name. Done state is server metadata, not part of the name. */
export function resolveRenamedTopicName(
  currentTopic: string,
  nextNameInput: string,
): string | null {
  const nextBase = nextNameInput.trim();
  if (nextBase.length === 0) {
    return null;
  }
  void currentTopic;
  return nextBase;
}

export function isTopicRenameUnchanged(currentTopic: string, nextNameInput: string): boolean {
  const nextTopic = resolveRenamedTopicName(currentTopic, nextNameInput);
  if (nextTopic == null) {
    return true;
  }
  return normalizeTopicForIdentity(nextTopic) === normalizeTopicForIdentity(currentTopic);
}
