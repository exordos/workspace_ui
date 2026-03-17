import { describe, expect, it } from "vitest";
import { isForceUpdateRequiredStatus, shouldRedirectToForceUpdate } from "./app-force-update.lib";

describe("app-force-update", () => {
  it("requires force-update only for ready status", () => {
    expect(isForceUpdateRequiredStatus("idle")).toBe(false);
    expect(isForceUpdateRequiredStatus("checking")).toBe(false);
    expect(isForceUpdateRequiredStatus("available")).toBe(false);
    expect(isForceUpdateRequiredStatus("downloading")).toBe(false);
    expect(isForceUpdateRequiredStatus("up-to-date")).toBe(false);
    expect(isForceUpdateRequiredStatus("error")).toBe(false);
    expect(isForceUpdateRequiredStatus("ready")).toBe(true);
  });

  it("redirects to force-update only when required and not already there", () => {
    expect(
      shouldRedirectToForceUpdate({
        hasInstances: true,
        isForceUpdateRequired: true,
        pathname: "/stream/general",
      }),
    ).toBe(true);

    expect(
      shouldRedirectToForceUpdate({
        hasInstances: true,
        isForceUpdateRequired: true,
        pathname: "/force-update",
      }),
    ).toBe(false);

    expect(
      shouldRedirectToForceUpdate({
        hasInstances: true,
        isForceUpdateRequired: true,
        pathname: "/org/chat.example.com/force-update",
      }),
    ).toBe(false);
  });

  it("does not redirect when not authenticated", () => {
    expect(
      shouldRedirectToForceUpdate({
        hasInstances: false,
        isForceUpdateRequired: true,
        pathname: "/stream/general",
      }),
    ).toBe(false);
  });

  it("does not redirect when force-update routing is disabled", () => {
    expect(
      shouldRedirectToForceUpdate({
        hasInstances: true,
        isForceUpdateRequired: true,
        pathname: "/stream/general",
        forceUpdateEnabled: false,
      }),
    ).toBe(false);
  });
});
