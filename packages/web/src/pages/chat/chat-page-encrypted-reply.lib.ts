import type { RealChatKeyChange } from "~/entities/messenger/chat-crypto-resources.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";

type ReplySource = Pick<
  MessengerMessage,
  "uuid" | "projectId" | "authorUuid" | "streamUuid" | "topicUuid" | "payload"
>;

/** Compares only the source identity and content, not mutable reaction or read metadata. */
export function isEncryptedReplySourceCurrent(
  source: ReplySource,
  latest: ReplySource | null | undefined,
): boolean {
  if (
    latest?.uuid !== source.uuid ||
    latest.projectId !== source.projectId ||
    latest.authorUuid !== source.authorUuid ||
    latest.streamUuid !== source.streamUuid ||
    latest.topicUuid !== source.topicUuid ||
    (source.payload.kind !== "e2ee" && source.payload.kind !== "markdown") ||
    latest.payload.kind !== source.payload.kind
  )
    return false;
  if (source.payload.kind === "e2ee") {
    return (
      latest.payload.kind === "e2ee" &&
      latest.payload.content === source.payload.content &&
      latest.payload.keyUuid === source.payload.keyUuid
    );
  }
  return latest.payload.kind === "markdown" && latest.payload.content === source.payload.content;
}

/** An unscoped key notification cannot prove that any cached quote remains valid. */
export function isEncryptedReplySourceAffectedByKeyChange(
  source: ReplySource,
  ownerKey: string | null,
  change?: RealChatKeyChange,
): boolean {
  if (change == null) return true;
  return (
    change.ownerKey === ownerKey &&
    change.streamUuid === source.streamUuid &&
    source.payload.kind === "e2ee" &&
    change.keyUuid === source.payload.keyUuid
  );
}
