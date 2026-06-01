/** Whether a postMessage origin is allowed for the native WebView bridge. */
export function isTrustedWebViewMessageOrigin(origin: string): boolean {
  if (origin === "null" && window.NativeApp != null) return true;
  if (origin === "" || origin === "null") return false;
  if (origin === window.location.origin) return true;
  return false;
}
