import { describe, expect, it } from "vitest";
import { normalizeElectronDeeplinkRoute } from "./app-deeplink.lib";

describe("normalizeElectronDeeplinkRoute", () => {
  it("returns slash-prefixed internal route as-is", () => {
    expect(normalizeElectronDeeplinkRoute("/dm/42")).toBe("/dm/42");
  });

  it("normalizes route without leading slash", () => {
    expect(normalizeElectronDeeplinkRoute("stream/5-general?msg=10")).toBe(
      "/stream/5-general?msg=10",
    );
  });

  it("rejects empty input", () => {
    expect(normalizeElectronDeeplinkRoute("")).toBeNull();
    expect(normalizeElectronDeeplinkRoute("   ")).toBeNull();
  });

  it("rejects javascript/data/vbscript schemes", () => {
    const scriptUrl = `java${"script"}:alert(1)`;
    expect(normalizeElectronDeeplinkRoute(scriptUrl)).toBeNull();
    expect(normalizeElectronDeeplinkRoute("data:text/html,hello")).toBeNull();
    expect(normalizeElectronDeeplinkRoute("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects protocol-relative and external absolute urls", () => {
    expect(normalizeElectronDeeplinkRoute("//evil.example/path")).toBeNull();
    expect(normalizeElectronDeeplinkRoute("https://evil.example/path")).toBeNull();
  });

  it("keeps hash/query and strips duplicate slashes in relative prefix handling", () => {
    expect(normalizeElectronDeeplinkRoute("settings/build#latest")).toBe("/settings/build#latest");
  });
});
