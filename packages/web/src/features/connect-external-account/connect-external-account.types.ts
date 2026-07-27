import type {
  ExternalAccount,
  ExternalAccountHistoryDepth,
  ExternalAccountSelectionMode,
} from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { ReactNode } from "react";

export type ConnectExternalAccountProvider = "zulip";
export type ConnectExternalAccountError =
  | "fill"
  | "duplicate"
  | "invalid-url"
  | "invalid"
  | "unavailable"
  | "forbidden"
  | "conflict"
  | "connect";

export interface ConnectExternalAccountDraft {
  provider: ConnectExternalAccountProvider;
  serverUrl: string;
  email: string;
  apiKey: string;
  selectionMode: ExternalAccountSelectionMode;
  historyDepth: ExternalAccountHistoryDepth;
}

export interface ConnectExternalAccountFormProps {
  draft: ConnectExternalAccountDraft;
  duplicateZulip: boolean;
  submitting: boolean;
  error: ConnectExternalAccountError | null;
  onProviderChange: (provider: ConnectExternalAccountProvider) => void;
  onServerUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSelectionModeChange: (value: ExternalAccountSelectionMode) => void;
  onHistoryDepthChange: (value: ExternalAccountHistoryDepth) => void;
  showSyncSettings: boolean;
  onSubmit: () => void;
}

export interface ConnectExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: WorkspaceRuntimeContext | null;
  reconnectAccount?: ExternalAccount | null;
  renderChatsStep?: (
    runtimeContext: WorkspaceRuntimeContext,
    account: ExternalAccount,
  ) => ReactNode;
}
