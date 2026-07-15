import type { WorkspaceEventPayload } from "~/shared/types/workspace-event";

const EXTERNAL_ACCOUNT_UPDATED_EVENT = "workspace:external-account-updated";

export function publishExternalAccountUpdated(payload: WorkspaceEventPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXTERNAL_ACCOUNT_UPDATED_EVENT, { detail: payload }));
}

export function subscribeExternalAccountUpdates(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EXTERNAL_ACCOUNT_UPDATED_EVENT, listener);
  return () => window.removeEventListener(EXTERNAL_ACCOUNT_UPDATED_EVENT, listener);
}
