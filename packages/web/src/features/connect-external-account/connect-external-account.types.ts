import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

export type ConnectExternalAccountProvider = "zulip";

export type ConnectExternalAccountError =
  | "fill"
  | "duplicate"
  | "invalid-url"
  | "invalid-email"
  | "invalid"
  | "forbidden"
  | "unavailable"
  | "connect";

export interface ConnectExternalAccountDraft {
  provider: ConnectExternalAccountProvider;
  serverUrl: string;
  email: string;
  apiKey: string;
}

export interface ConnectExternalAccountFormProps {
  draft: ConnectExternalAccountDraft;
  accounts: readonly ExternalAccount[];
  submitting: boolean;
  error: ConnectExternalAccountError | null;
  onProviderChange: (provider: ConnectExternalAccountProvider) => void;
  onServerUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSubmit: () => void;
}

export interface ConnectExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: WorkspaceRuntimeContext | null;
}
