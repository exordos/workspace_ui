import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import { isWorkspaceAvatarUrn } from "~/shared/lib/workspace-avatar-urn.lib";
import type { User } from "./user.types";

function normalizeNamePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function buildUserDisplayName(dto: WorkspaceMessengerUserDto): string {
  const parts = [normalizeNamePart(dto.first_name), normalizeNamePart(dto.last_name)].filter(
    (part): part is string => part != null,
  );
  const fullName = parts.join(" ").trim();
  return fullName.length > 0 ? fullName : dto.username.trim();
}

export function adaptWorkspaceMessengerUserDto(dto: WorkspaceMessengerUserDto): User {
  return {
    uuid: dto.uuid,
    username: dto.username,
    firstName: normalizeNamePart(dto.first_name),
    lastName: normalizeNamePart(dto.last_name),
    displayName: buildUserDisplayName(dto),
    email: dto.email ?? null,
    avatarUrl: isWorkspaceAvatarUrn(dto.avatar) ? dto.avatar : null,
    status: dto.status,
    statusEmoji: dto.status_emoji ?? null,
    statusText: dto.status_text ?? null,
    lastPingAt: dto.last_ping_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}
