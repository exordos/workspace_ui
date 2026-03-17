/**
 * PWA install prompt and runtime detection.
 *
 * Captures the `beforeinstallprompt` event so the app can show a custom
 * install banner. Also provides runtime detection (Electron / PWA / browser).
 *
 * Usage:
 *   import { canInstallPwa, promptInstallPwa, getRuntime } from "~/lib/pwa";
 */
import { isElectron } from "./electron";

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const DEV_SERVICE_WORKER_SCRIPT_RE = /\/(?:dev-)?sw\.js(?:\?|$)/;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isPwa(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function canInstallPwa(): boolean {
  return deferredInstallPrompt != null;
}

export async function promptInstallPwa(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const installPrompt = deferredInstallPrompt;
  if (!installPrompt) return "unavailable";
  deferredInstallPrompt = null;
  const { outcome } = await installPrompt.prompt();
  notifyListeners();
  return outcome;
}

export function onInstallAvailableChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

function getServiceWorkerScriptUrl(registration: ServiceWorkerRegistration): string {
  return (
    registration.active?.scriptURL ??
    registration.waiting?.scriptURL ??
    registration.installing?.scriptURL ??
    ""
  );
}

export function cleanupDevServiceWorkers(): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations
          .filter((registration) =>
            DEV_SERVICE_WORKER_SCRIPT_RE.test(getServiceWorkerScriptUrl(registration)),
          )
          .map((registration) => registration.unregister()),
      ),
    )
    .catch(() => {});
}

export function initPwaListeners(): () => void {
  if (isElectron() || typeof window === "undefined") return () => {};

  const onBeforeInstall = (e: Event) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  };

  const onAppInstalled = () => {
    deferredInstallPrompt = null;
    notifyListeners();
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onAppInstalled);

  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onAppInstalled);
  };
}

export function getRuntime(): "electron" | "pwa" | "browser" {
  if (isElectron()) return "electron";
  if (isPwa()) return "pwa";
  return "browser";
}
