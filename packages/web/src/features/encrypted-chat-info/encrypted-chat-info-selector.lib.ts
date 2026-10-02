import type {
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
} from "~/entities/messenger/messenger.types";
import {
  selectUserDisplayName,
  resolveUserPresenceVisual,
} from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import type {
  EncryptedChatKeyRequestView,
  EncryptedChatMemberView,
} from "./encrypted-chat-info.types";

export interface EncryptedChatInfoSnapshot {
  readonly ownerKey: string | null;
  readonly projectId: string | null;
  readonly streamUuid: string;
  readonly catalogOwnerKey: string | null;
  readonly messagesOwnerKey: string | null;
  readonly usersOwnerKey: string | null;
  readonly streamsById: Readonly<Record<string, MessengerStream>>;
  readonly bindingsById: Readonly<Record<string, MessengerStreamBinding>>;
  readonly messagesById: Readonly<Record<string, MessengerMessage>>;
  readonly usersById: UsersById;
}

export interface EncryptedChatInfoProjection {
  readonly stream: MessengerStream;
  readonly keyCreatedAt?: string;
  readonly requests: readonly EncryptedChatKeyRequestView[];
  readonly members: readonly EncryptedChatMemberView[];
  readonly onlineCount: number;
}

/** Missing or stale owners yield no metadata, even if another project reused the UUID. */
export function selectEncryptedChatInfo(
  snapshot: EncryptedChatInfoSnapshot,
): EncryptedChatInfoProjection | null {
  if (snapshot.ownerKey == null || snapshot.catalogOwnerKey !== snapshot.ownerKey) return null;
  const stream = snapshot.streamsById[snapshot.streamUuid];
  if (stream?.encryption !== true || stream.projectId !== snapshot.projectId) return null;
  const users = snapshot.usersOwnerKey === snapshot.ownerKey ? snapshot.usersById : {};
  const members = Object.values(snapshot.bindingsById)
    .filter(
      (binding) => binding.streamUuid === stream.uuid && binding.projectId === snapshot.projectId,
    )
    .map((binding) => {
      const user = users[binding.userUuid];
      return {
        id: binding.uuid,
        name: selectUserDisplayName(user, binding.userUuid),
        avatarUrl: user?.avatarUrl ?? null,
      };
    });
  const onlineCount = Object.values(snapshot.bindingsById).filter(
    (binding) =>
      binding.streamUuid === stream.uuid &&
      binding.projectId === snapshot.projectId &&
      resolveUserPresenceVisual(users[binding.userUuid]?.status) === "active",
  ).length;
  const messages =
    snapshot.messagesOwnerKey === snapshot.ownerKey
      ? Object.values(snapshot.messagesById).filter(
          (message) =>
            message.streamUuid === stream.uuid && message.projectId === snapshot.projectId,
        )
      : [];
  const keyUuid = stream.currentEncryptionKey?.keyUuid;
  const matchingAnnouncement = messages.find(
    (message) => message.payload.kind === "key_announced" && message.payload.keyUuid === keyUuid,
  );
  const requests = messages.flatMap((message) => {
    if (message.payload.kind !== "key_request" || message.payload.keyUuid !== keyUuid) return [];
    const user = users[message.authorUuid];
    return [
      {
        requestMessageUuid: message.uuid,
        name: selectUserDisplayName(user, message.authorUuid),
        deviceName: message.payload.deviceName,
        avatarUrl: user?.avatarUrl ?? null,
        canGrant: false,
        canReject: false,
      },
    ];
  });
  return { stream, keyCreatedAt: matchingAnnouncement?.createdAt, requests, members, onlineCount };
}
