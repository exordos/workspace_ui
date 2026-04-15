import { ensureJitsiExternalApiLoaded } from "~/shared/lib/jitsi-external-api.loader";

await ensureJitsiExternalApiLoaded();

const { mountApplication } = await import("./main-app");
mountApplication();
