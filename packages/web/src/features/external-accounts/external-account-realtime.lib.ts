import type { WorkspaceEventPayload } from "~/shared/types/workspace-event";

const EXTERNAL_ACCOUNT_UPDATED_EVENT = "workspace:external-account-updated";

export function publishExternalAccountUpdated(payload: WorkspaceEventPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXTERNAL_ACCOUNT_UPDATED_EVENT, { detail: payload }));
}

export function subscribeExternalAccountUpdates(
  listener: (payload: WorkspaceEventPayload) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleEvent = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    if (payload == null || typeof payload !== "object" || typeof payload.kind !== "string") return;
    listener(payload as WorkspaceEventPayload);
  };
  window.addEventListener(EXTERNAL_ACCOUNT_UPDATED_EVENT, handleEvent);
  return () => window.removeEventListener(EXTERNAL_ACCOUNT_UPDATED_EVENT, handleEvent);
}
