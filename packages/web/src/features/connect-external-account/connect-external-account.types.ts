import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

export type ConnectExternalAccountProvider = "zulip";

export interface ConnectExternalAccountDraft {
  provider: ConnectExternalAccountProvider;
  serverUrl: string;
  login: string;
  token: string;
}

export interface ConnectExternalAccountFormProps {
  draft: ConnectExternalAccountDraft;
  accounts: readonly ExternalAccount[];
  submitting: boolean;
  error: string | null;
  onProviderChange: (provider: ConnectExternalAccountProvider) => void;
  onServerUrlChange: (value: string) => void;
  onLoginChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
}

export interface ConnectExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: WorkspaceRuntimeContext | null;
}
