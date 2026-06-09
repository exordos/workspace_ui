/**
 * Debug tracing for link preview (flash / stale cache / re-render investigations).
 *
 * Gated by runtime `trace:link-preview` — enable via `__dev__.setPipelineTrace("link-preview")`.
 */
import { logLinkPreviewTrace } from "~/shared/lib/pipeline-trace.lib";

export function traceLinkPreview(event: string, data?: Record<string, unknown>): void {
  logLinkPreviewTrace(event, data ?? {});
}
