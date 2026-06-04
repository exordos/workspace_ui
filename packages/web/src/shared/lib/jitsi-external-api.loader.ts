/**
 * Loads the vendored Jitsi Meet IFrame External API (`public/vendor/jitsi-external_api.js`)
 * before the app bundle runs, so `window.JitsiMeetExternalAPI` exists when `@jitsi/react-sdk`
 * calls `fetchExternalApi` (which otherwise injects a remote `<script>` and breaks strict CSP).
 *
 * Usage: call `ensureJitsiExternalApiLoaded()` before opening a Jitsi call (lazy load).
 */

export function ensureJitsiExternalApiLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  const w = window as Window & { JitsiMeetExternalAPI?: unknown };
  if (w.JitsiMeetExternalAPI != null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const base = import.meta.env.BASE_URL;
    script.src = `${base}vendor/jitsi-external_api.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      reject(new Error(`Failed to load Jitsi external_api from ${script.src}`));
    };
    document.head.appendChild(script);
  });
}
