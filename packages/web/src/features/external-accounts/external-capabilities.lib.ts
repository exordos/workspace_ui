import type { ExternalCapabilities } from "./external-accounts.types";

export const EXTERNAL_CAPABILITY = {
  chatCatalog: "messenger.chat_catalog",
  messageSend: "messenger.message.send",
  messageEdit: "messenger.message.edit",
  messageDelete: "messenger.message.delete",
  messageRead: "messenger.message.read",
  reactionWrite: "messenger.reaction.write",
  streamRename: "messenger.stream.rename",
  topicRename: "messenger.topic.rename",
  topicMove: "messenger.topic.move",
  fileTransfer: "messenger.file.transfer",
} as const;

export type ExternalCapabilityName = (typeof EXTERNAL_CAPABILITY)[keyof typeof EXTERNAL_CAPABILITY];

export function isExternalCapabilityAvailable(
  capabilities: ExternalCapabilities,
  name: ExternalCapabilityName,
): boolean {
  return capabilities[name]?.available === true;
}
