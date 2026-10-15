import { selectWorkspaceStreamMembers } from "~/entities/messenger/messenger-right-panel.lib";
import type {
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
} from "~/entities/messenger/messenger.types";
import {
  selectUserDisplayName,
  resolveUserPresenceVisual,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
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
  readonly keyAnnouncementDates: Readonly<Record<string, string>>;
  readonly requests: readonly EncryptedChatKeyRequestView[];
  readonly members: readonly EncryptedChatMemberView[];
  readonly onlineCount: number;
}

function resolveMemberStatusLabel(status: User["status"] | null): string | null {
  if (status == null) return null;
  if (status === "active") return t("presence.online");
  if (status === "idle") return t("presence.away");
  if (status === "offline") return t("presence.offline");
  return t("presence.doNotDisturb");
}

function resolveMemberRoleLabel(role: MessengerStreamBinding["role"]): string {
  return role === "administrator" ? t("roles.admin") : t(`roles.${role}`);
}

/** Missing or stale owners yield no metadata, even if another project reused the UUID. */
export function selectEncryptedChatInfo(
  snapshot: EncryptedChatInfoSnapshot,
): EncryptedChatInfoProjection | null {
  if (snapshot.ownerKey == null || snapshot.catalogOwnerKey !== snapshot.ownerKey) return null;
  const stream = snapshot.streamsById[snapshot.streamUuid];
  if (stream?.encryption !== true || stream.projectId !== snapshot.projectId) return null;
  const users = snapshot.usersOwnerKey === snapshot.ownerKey ? snapshot.usersById : {};
  const streamMembers = selectWorkspaceStreamMembers(
    Object.values(snapshot.bindingsById).filter(
      (binding) => binding.streamUuid === stream.uuid && binding.projectId === snapshot.projectId,
    ),
    users,
  );
  const members = streamMembers.map((member) => ({
    id: member.bindingUuid,
    name: member.name,
    avatarUrl: member.avatarUrl,
    email: member.email,
    presence: resolveUserPresenceVisual(member.status),
    statusLabel: resolveMemberStatusLabel(member.status),
    roleLabel: resolveMemberRoleLabel(member.role),
  }));
  const onlineCount = streamMembers.filter((member) => member.isOnline).length;
  const messages =
    snapshot.messagesOwnerKey === snapshot.ownerKey
      ? Object.values(snapshot.messagesById).filter(
          (message) =>
            message.streamUuid === stream.uuid && message.projectId === snapshot.projectId,
        )
      : [];
  const keyUuid = stream.currentEncryptionKey?.keyUuid;
  const keyAnnouncementDates: Record<string, string> = {};
  for (const message of messages) {
    if (message.payload.kind !== "key_announced") continue;
    const announcedKeyUuid = message.payload.keyUuid;
    const previous = keyAnnouncementDates[announcedKeyUuid];
    if (previous == null || Date.parse(message.createdAt) < Date.parse(previous))
      keyAnnouncementDates[announcedKeyUuid] = message.createdAt;
  }
  const requests = messages.flatMap((message) => {
    if (message.payload.kind !== "key_request") return [];
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
  return {
    stream,
    keyCreatedAt: keyUuid == null ? undefined : keyAnnouncementDates[keyUuid],
    keyAnnouncementDates,
    requests,
    members,
    onlineCount,
  };
}
