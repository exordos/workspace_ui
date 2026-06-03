// Invariant Jitsi iframe setup — permissions and size must not depend on shell state.

/** Capabilities required for the call session (camera, mic, fullscreen, screen share). */
export const JITSI_IFRAME_ALLOW_POLICY = "camera; microphone; fullscreen; display-capture";

/** One-time iframe setup — shell minimize/expand must not look like a new session to Jitsi. */
export function configureJitsiIframe(iframeElement: HTMLElement | null): void {
  if (!iframeElement || !("style" in iframeElement)) return;
  iframeElement.style.width = "100%";
  iframeElement.style.height = "100%";
  iframeElement.style.minHeight = "0";
  iframeElement.setAttribute("allow", JITSI_IFRAME_ALLOW_POLICY);
}
