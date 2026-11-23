import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerMessagePayloadDto,
} from "~/shared/api/messenger.types";
import { conversationIdForTopic } from "../messenger-ids.lib";
import type { MessengerMessage, MessengerMessagePayload } from "../messenger.types";

// A message is stored once by uuid and enters chat lists through separate bucket ids.
// Compute the topic conversation id here; the stream-wide index is added later in the store.
export function adaptMessengerMessage(dto: WorkspaceMessengerMessageDto): MessengerMessage {
  return {
    uuid: dto.uuid,
    conversationId: conversationIdForTopic(dto.stream_uuid, dto.topic_uuid),
    projectId: dto.project_id,
    streamUuid: dto.stream_uuid,
    topicUuid: dto.topic_uuid,
    authorUuid: dto.author_uuid,
    userUuid: dto.user_uuid,
    payload: adaptMessengerMessagePayload(dto.payload),
    ...(dto.poll_state == null
      ? {}
      : {
          pollState: {
            revision: dto.poll_state.revision,
            isClosed: dto.poll_state.is_closed,
            voterCount: dto.poll_state.voter_count,
            questions: dto.poll_state.questions.map((q) => ({
              questionUuid: q.question_uuid,
              voterCount: q.voter_count,
              optionCounts: { ...q.option_counts },
              ...(q.option_voter_previews && {
                optionVoterPreviews: Object.fromEntries(
                  Object.entries(q.option_voter_previews).map(([option, users]) => [
                    option,
                    [...users],
                  ]),
                ),
              }),
            })),
            myVotes: dto.poll_state.my_votes.map((v) => ({
              questionUuid: v.question_uuid,
              optionUuids: [...v.option_uuids],
            })),
          },
        }),
    read: dto.read,
    pinned: dto.pinned,
    starred: dto.starred,
    isOwn: dto.is_own,
    mentioned: dto.mentioned,
    sourceName: dto.source_name ?? "native",
    providerUuid: dto.provider_uuid ?? null,
    providerIdentity: dto.provider_identity ?? null,
    provider: dto.provider ?? null,
    delivery: dto.delivery ?? null,
    // Backend message snapshot уже содержит финальный aggregate счетчиков.
    // Своих reactionUuid в этом snapshot нет, поэтому adapter всегда начинает с
    // пустой локальной проекции; store/action слой обогатит ее отдельно из cache/SWR.
    reactions: { ...dto.reactions },
    reactionUserUuidsByEmojiName: Object.fromEntries(
      Object.entries(dto.reaction_users).map(([emojiName, userUuids]) => [
        emojiName,
        [...userUuids],
      ]),
    ),
    ownReactionUuidsByEmojiName: {},
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptMessengerMessagePayload(
  dto: WorkspaceMessengerMessagePayloadDto,
): MessengerMessagePayload {
  switch (dto.kind) {
    case "markdown":
      return { kind: "markdown", content: dto.content };
    case "poll":
      return {
        kind: "poll",
        questions: dto.questions.map((q) => ({
          uuid: q.uuid,
          text: q.text,
          options: q.options.map((o) => ({ ...o })),
          correctOptionUuids: [...(q.correct_option_uuids ?? [])],
        })),
        multipleAnswers: dto.multiple_answers,
        isAnonymous: dto.is_anonymous,
        allowRevote: dto.allow_revote,
        resultsVisibility: dto.results_visibility,
        allowAddingOptions: dto.allow_adding_options ?? false,
        closesAt: dto.closes_at ?? null,
        closedAt: dto.closed_at ?? null,
      };
    case "e2ee":
      return { kind: dto.kind, keyUuid: dto.key_uuid, content: dto.content };
    case "key_request":
      return {
        kind: dto.kind,
        keyUuid: dto.key_uuid,
        deviceId: dto.device_id,
        deviceName: dto.device_name,
        publicKey: dto.public_key,
      };
    case "key_announced":
      return { kind: dto.kind, keyUuid: dto.key_uuid };
    case "key_grant":
      return {
        kind: dto.kind,
        keyUuid: dto.key_uuid,
        requestMessageUuid: dto.request_message_uuid,
        senderDeviceId: dto.sender_device_id,
        recipientDeviceId: dto.recipient_device_id,
        content: dto.content,
      };
    case "key_reject":
      return {
        kind: dto.kind,
        keyUuid: dto.key_uuid,
        requestMessageUuid: dto.request_message_uuid,
        senderDeviceId: dto.sender_device_id,
        recipientDeviceId: dto.recipient_device_id,
      };
  }
}
