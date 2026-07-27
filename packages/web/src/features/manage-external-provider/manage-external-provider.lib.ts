import type {
  WorkspaceExternalProviderPolicyDto,
  WorkspaceExternalProviderPolicyUpdateRequestBody,
} from "~/shared/api/messenger-external-provider-admin.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { ExternalProviderPolicyDraft } from "./manage-external-provider.types";

function errorType(error: MessengerApiError): unknown {
  if (error.data == null || typeof error.data !== "object" || Array.isArray(error.data)) {
    return null;
  }
  return "type" in error.data ? error.data.type : null;
}

export function isExternalProviderAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof MessengerApiError)) return false;
  return (
    error.status === 401 ||
    (error.status === 403 && errorType(error) === "ExternalResourceForbiddenError")
  );
}

export function isExternalProviderPolicyConflictError(error: unknown): boolean {
  return (
    error instanceof MessengerApiError &&
    error.status === 412 &&
    errorType(error) === "ExternalPreconditionFailedError"
  );
}

export function externalProviderPolicyDraft(
  policy: WorkspaceExternalProviderPolicyDto,
): ExternalProviderPolicyDraft {
  return {
    enabled: policy.enabled,
    limits: { ...policy.limits },
  };
}

export function externalProviderPolicyUpdateBody(
  draft: ExternalProviderPolicyDraft,
): WorkspaceExternalProviderPolicyUpdateRequestBody {
  return {
    settings: {
      kind: "zulip",
      enabled: draft.enabled,
      limits: { ...draft.limits },
      custom_ca_bundle: null,
    },
  };
}

export function areExternalProviderPolicyDraftsEqual(
  left: ExternalProviderPolicyDraft,
  right: ExternalProviderPolicyDraft,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.limits.max_accounts === right.limits.max_accounts &&
    left.limits.max_selected_chats_per_account === right.limits.max_selected_chats_per_account &&
    left.limits.max_file_bytes === right.limits.max_file_bytes
  );
}

export function rebaseExternalProviderPolicyDraft(
  base: ExternalProviderPolicyDraft,
  local: ExternalProviderPolicyDraft,
  incoming: ExternalProviderPolicyDraft,
): ExternalProviderPolicyDraft {
  return {
    enabled: local.enabled === base.enabled ? incoming.enabled : local.enabled,
    limits: {
      max_accounts:
        local.limits.max_accounts === base.limits.max_accounts
          ? incoming.limits.max_accounts
          : local.limits.max_accounts,
      max_selected_chats_per_account:
        local.limits.max_selected_chats_per_account === base.limits.max_selected_chats_per_account
          ? incoming.limits.max_selected_chats_per_account
          : local.limits.max_selected_chats_per_account,
      max_file_bytes:
        local.limits.max_file_bytes === base.limits.max_file_bytes
          ? incoming.limits.max_file_bytes
          : local.limits.max_file_bytes,
    },
  };
}
