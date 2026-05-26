/** Bootstrap / auth gate status for the authenticated layout shell. */
export type LayoutUserConnectionStatus = "idle" | "loading" | "ready" | "degraded" | "blocked";

export function isLayoutUserConnectionReady(status: LayoutUserConnectionStatus): boolean {
  return status === "ready" || status === "degraded";
}
