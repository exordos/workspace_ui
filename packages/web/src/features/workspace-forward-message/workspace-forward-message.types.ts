import type {
  MessengerAudience,
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

export interface WorkspaceForwardMessageOpenRequest {
  messageUuids: readonly MessengerUuid[];
  selectedText?: string;
  onSuccess?: () => void;
}

export interface WorkspaceForwardMessageState {
  isOpen: boolean;
  messageUuids: MessengerUuid[];
  selectedText: string | undefined;
  onSuccess: (() => void) | undefined;
  isSubmitting: boolean;
  error: string | null;
  open: (request: WorkspaceForwardMessageOpenRequest) => void;
  close: () => void;
  setSubmitting: (value: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type WorkspaceForwardSourceMessage = Pick<
  MessengerMessage,
  "uuid" | "streamUuid" | "topicUuid" | "authorUuid" | "payload" | "createdAt"
>;

export interface WorkspaceForwardTopicTarget {
  kind: "topic";
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
}

export interface WorkspaceForwardDirectTarget {
  kind: "direct";
  userUuid: MessengerUuid;
}

export type WorkspaceForwardTarget = WorkspaceForwardTopicTarget | WorkspaceForwardDirectTarget;
export type WorkspaceResolvedForwardTarget = WorkspaceForwardTopicTarget;

export type WorkspaceForwardStreamCandidate = Pick<
  MessengerStream,
  "uuid" | "name" | "audience" | "isPrivate" | "directUserUuid"
> &
  Partial<Pick<MessengerStream, "isArchived">>;

export type WorkspaceForwardTopicCandidate = Pick<
  MessengerTopic,
  "uuid" | "streamUuid" | "name" | "isDefault"
> &
  Partial<Pick<MessengerTopic, "isDone">>;

export interface WorkspaceForwardStreamOption {
  streamUuid: MessengerUuid;
  label: string;
  audience: MessengerAudience;
  isPrivate: boolean;
}

export interface WorkspaceForwardTopicOption {
  topicUuid: MessengerUuid;
  streamUuid: MessengerUuid;
  label: string;
  isDefault: boolean;
  isDone: boolean;
}

export interface WorkspaceForwardDirectStreamAppliedResult {
  status?: "applied";
  stream: Pick<MessengerStream, "uuid" | "directUserUuid">;
  defaultTopic: Pick<MessengerTopic, "uuid" | "streamUuid" | "isDefault">;
}

export interface WorkspaceForwardDirectStreamSkippedResult {
  status: "skipped";
  ownerKey: string | null;
  reason: "missing-context" | "stale-owner";
}

export type WorkspaceForwardDirectStreamResult =
  | WorkspaceForwardDirectStreamAppliedResult
  | WorkspaceForwardDirectStreamSkippedResult;

export type CreateWorkspaceDirectForwardStream = (options: {
  runtimeContext: WorkspaceRuntimeContext;
  directUserUuid: MessengerUuid;
  name?: string;
  description?: string;
}) => Promise<WorkspaceForwardDirectStreamResult>;
