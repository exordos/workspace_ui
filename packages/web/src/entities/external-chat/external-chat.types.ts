import type {
  WorkspaceExternalChatStatus,
  WorkspaceExternalChatType,
} from "~/shared/api/messenger-external-chats.types";

export interface ExternalChat {
  uuid: string;
  externalAccountUuid: string;
  type: WorkspaceExternalChatType;
  displayName: string;
  selected: boolean;
  projectId: string | null;
  projectionStreamUuid: string | null;
  status: WorkspaceExternalChatStatus;
  safeError: string | null;
  transitionPending: boolean;
  revision: number;
  updatedAt: string;
}

export type ExternalChatLoadStatus = "idle" | "loading" | "ready" | "error";
