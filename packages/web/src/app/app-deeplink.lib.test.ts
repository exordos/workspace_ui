import { describe, expect, it } from "vitest";
import { normalizeElectronDeeplinkRoute } from "./app-deeplink.lib";

describe("normalizeElectronDeeplinkRoute", () => {
  it("rejects legacy messenger routes", () => {
    expect(normalizeElectronDeeplinkRoute("/dm/42")).toBeNull();
    expect(normalizeElectronDeeplinkRoute("/org/acme/inbox")).toBeNull();
  });

  it("normalizes route without leading slash", () => {
    expect(
      normalizeElectronDeeplinkRoute(
        "org/acme/project/project-a/stream/stream-uuid?msg=message-uuid",
      ),
    ).toBe("/org/acme/project/project-a/stream/stream-uuid?msg=message-uuid");
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
