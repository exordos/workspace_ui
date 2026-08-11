import type {
  applyMessengerMessageWindow,
  fetchMessengerMessageWindow,
  resolveMessengerMessageAnchor,
} from "~/entities/messenger/messenger-messages-loader.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

export type WorkspaceMessageAnchorNavigationPhase =
  | "requested"
  | "resolving"
  | "loading-window"
  | "awaiting-dom"
  | "focused"
  | "failed"
  | "superseded";

export type WorkspaceMessageAnchorNavigationSource =
  | "local-quote"
  | "urn"
  | "direct-route"
  | "hash"
  | "browser-history"
  | "retry";

export interface WorkspaceMessageAnchorFocusTarget {
  intentId: number;
  messageUuid: MessengerUuid;
  focusAttempt: number;
}

export interface WorkspaceMessageAnchorRouteScope {
  organizationId: string;
  projectId: string;
}

export interface WorkspaceMessageAnchorNavigationError {
  intentId: number;
  messageUuid: MessengerUuid;
  kind: "not-found" | "access-denied" | "network" | "invalid-context" | "dom-missing";
  detail: string;
  retryable: boolean;
}

export interface WorkspaceMessageAnchorNavigationIntent {
  id: number;
  messageUuid: MessengerUuid;
  conversationId: MessengerConversationId | null;
  ownerKey: string;
  runtimeGeneration: number;
  routeKey: string;
  source: WorkspaceMessageAnchorNavigationSource;
  phase: WorkspaceMessageAnchorNavigationPhase;
  transitionRequired: boolean;
  recoveryAttempt: number;
  pendingDomRecovery: boolean;
  focusAttempt: number;
}

export interface WorkspaceMessageAnchorPreviewPresentation {
  intentId: number;
  messageUuid: MessengerUuid;
  phase: "staged" | "loading-window" | "awaiting-dom" | "failed";
  previewMessage: MessengerMessage | null;
}

export interface WorkspaceMessageAnchorRouteRequest {
  messageUuid: MessengerUuid;
  conversationId: MessengerConversationId | null;
  routeKey: string;
  source: "direct-route" | "hash" | "browser-history";
  scope: WorkspaceMessageAnchorRouteScope;
}

export interface WorkspaceMessageAnchorNavigationLoaderDeps {
  resolveAnchor?: typeof resolveMessengerMessageAnchor;
  fetchWindow?: typeof fetchMessengerMessageWindow;
  applyWindow?: typeof applyMessengerMessageWindow;
}

export interface WorkspaceMessageAnchorNavigationOptions {
  runtimeContext: WorkspaceRuntimeContext | null;
  routeRequest: WorkspaceMessageAnchorRouteRequest | null;
  routePath: string;
  windowBusy: boolean;
  getRuntimeContext: () => WorkspaceRuntimeContext | null;
  resolveKnownConversationId: (messageUuid: MessengerUuid) => MessengerConversationId | null;
  isMessageInWindow: (
    conversationId: MessengerConversationId,
    messageUuid: MessengerUuid,
  ) => boolean;
  isMessageWindowReady: (
    conversationId: MessengerConversationId,
    messageUuid: MessengerUuid,
  ) => boolean;
  loader?: WorkspaceMessageAnchorNavigationLoaderDeps;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  buildDirectRoute: (messageUuid: MessengerUuid) => string;
  buildConversationRoute: (
    conversationId: MessengerConversationId,
    messageUuid: MessengerUuid,
  ) => string | null;
  cancelTail: () => void;
  unavailableError: string;
  domMissingError: string;
}

export interface WorkspaceMessageAnchorNavigationResult {
  intent: WorkspaceMessageAnchorNavigationIntent | null;
  focusTarget: WorkspaceMessageAnchorFocusTarget | null;
  previewPresentation: WorkspaceMessageAnchorPreviewPresentation | null;
  navigationError: WorkspaceMessageAnchorNavigationError | null;
  startMessageNavigation: (
    messageUuid: MessengerUuid,
    source?: "local-quote" | "urn",
  ) => number | null;
  retryMessageNavigation: () => void;
  onDomFocusApplied: (target: WorkspaceMessageAnchorFocusTarget) => void;
  onDomFocusMissing: (target: WorkspaceMessageAnchorFocusTarget) => void;
  cancelForTail: () => void;
}
