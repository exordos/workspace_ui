import { setupScreenSharingRender } from "@jitsi/electron-sdk/renderer";
import { isElectron } from "~/shared/lib/electron";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { JitsiExternalApiWithParticipants } from "./jitsi-call.types";

// The SDK owns cleanup on the Jitsi API's dispose lifecycle. Keep one hook per
// API object so duplicate ready callbacks cannot duplicate native subscriptions.
const configuredApis = new WeakSet<object>();

export function setupJitsiScreenSharing(api: JitsiExternalApiWithParticipants): void {
  if (!isElectron() || configuredApis.has(api)) return;

  configuredApis.add(api);
  try {
    setupScreenSharingRender(api);
  } catch (error) {
    // A missing SDK preload bridge must not break the active call itself.
    configuredApis.delete(api);
    reportUnexpectedError("jitsi:screenSharingSetup", error);
  }
}
