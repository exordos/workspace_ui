import type {
  WorkspaceExternalProviderHealthDto,
  WorkspaceExternalProviderLimitsDto,
  WorkspaceExternalProviderPolicyDto,
} from "~/shared/api/messenger-external-provider-admin.types";

export type ExternalProviderAccessStatus = "idle" | "checking" | "allowed" | "denied" | "error";
export type ExternalProviderLoadStatus = "idle" | "loading" | "ready" | "error";
export type ExternalProviderSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "blocked"
  | "conflict"
  | "error";
export type ExternalProviderActionStatus = "idle" | "suspending" | "resuming" | "success" | "error";

export type ExternalProviderOperationError =
  | "access"
  | "load_policy"
  | "load_health"
  | "save"
  | "custom_ca_update_unsupported"
  | "conflict"
  | "suspend"
  | "resume";

export interface ExternalProviderPolicyDraft {
  enabled: boolean;
  limits: WorkspaceExternalProviderLimitsDto;
}

export interface ManageExternalProviderState {
  accessStatus: ExternalProviderAccessStatus;
  accessError: ExternalProviderOperationError | null;
  policyStatus: ExternalProviderLoadStatus;
  policyError: ExternalProviderOperationError | null;
  policy: WorkspaceExternalProviderPolicyDto | null;
  policyEtag: string | null;
  draft: ExternalProviderPolicyDraft | null;
  healthStatus: ExternalProviderLoadStatus;
  healthError: ExternalProviderOperationError | null;
  health: WorkspaceExternalProviderHealthDto | null;
  saveStatus: ExternalProviderSaveStatus;
  saveError: ExternalProviderOperationError | null;
  actionStatus: ExternalProviderActionStatus;
  actionError: ExternalProviderOperationError | null;
}
