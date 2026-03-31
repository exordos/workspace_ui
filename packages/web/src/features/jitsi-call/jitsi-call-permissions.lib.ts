export const JITSI_IFRAME_ALLOW_POLICY = "camera; microphone; fullscreen; display-capture";

export function configureJitsiIframe(iframeElement: HTMLElement | null, minimized: boolean): void {
  if (!iframeElement || !("style" in iframeElement)) return;
  iframeElement.style.width = "100%";
  iframeElement.style.height = "100%";
  iframeElement.style.minHeight = minimized ? "0" : "400px";
  iframeElement.setAttribute("allow", JITSI_IFRAME_ALLOW_POLICY);
}

