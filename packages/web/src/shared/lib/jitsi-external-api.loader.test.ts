import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureJitsiExternalApiLoaded } from "./jitsi-external-api.loader";

describe("jitsi-external-api.loader", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "JitsiMeetExternalAPI");
    document.head
      .querySelectorAll("script[src*='jitsi-external_api']")
      .forEach((el) => el.remove());
  });

  it("resolves immediately when JitsiMeetExternalAPI is already on window", async () => {
    (window as unknown as Record<string, unknown>).JitsiMeetExternalAPI = {};
    const appendChild = vi.spyOn(document.head, "appendChild");

    await ensureJitsiExternalApiLoaded();

    expect(appendChild).not.toHaveBeenCalled();
  });

  it("appends a script tag pointing at vendored path under BASE_URL", async () => {
    Reflect.deleteProperty(window, "JitsiMeetExternalAPI");

    const promise = ensureJitsiExternalApiLoaded();
    const script = document.head.querySelector("script[src]");
    expect(script).toBeTruthy();
    expect(script?.getAttribute("src")).toBe("/vendor/jitsi-external_api.js");
    script?.dispatchEvent(new Event("load"));
    await promise;
  });
});
