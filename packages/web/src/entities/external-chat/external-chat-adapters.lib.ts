import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-chats.types";
import type { ExternalChat } from "./external-chat.types";

export function adaptWorkspaceExternalChatDto(dto: WorkspaceExternalChatDto): ExternalChat {
  return {
    uuid: dto.uuid,
    externalAccountUuid: dto.external_account_uuid,
    type: dto.source.chat_type,
    displayName: dto.display_name,
    selected: dto.selected,
    projectId: dto.project_id,
    projectionStreamUuid: dto.projection_stream_uuid,
    status: dto.status,
    safeError: dto.safe_error,
    transitionPending: dto.transition_pending,
    revision: dto.revision,
    updatedAt: dto.updated_at,
  };
}
