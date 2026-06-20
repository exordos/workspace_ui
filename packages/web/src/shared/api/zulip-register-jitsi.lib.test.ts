import { describe, expect, it } from "vitest";
import { parseRegisterResponseJitsiServerUrl } from "./zulip-register-jitsi.lib";

describe("parseRegisterResponseJitsiServerUrl", () => {
  it("returns null for non-object input", () => {
    expect(parseRegisterResponseJitsiServerUrl(null)).toBeNull();
    expect(parseRegisterResponseJitsiServerUrl(undefined)).toBeNull();
    expect(parseRegisterResponseJitsiServerUrl("x")).toBeNull();
    expect(parseRegisterResponseJitsiServerUrl([])).toBeNull();
  });

  it("uses jitsi_server_url when present", () => {
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "https://calls.example.com/",
      }),
    ).toBe("https://calls.example.com");
  });

  it("prefers jitsi_server_url over realm and server fields", () => {
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "https://legacy.example.com",
        realm_jitsi_server_url: "https://realm.example.com",
        server_jitsi_server_url: "https://server.example.com",
      }),
    ).toBe("https://legacy.example.com");
  });

  it("uses realm_jitsi_server_url when legacy is empty", () => {
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "",
        realm_jitsi_server_url: "https://realm.example.com/path/",
        server_jitsi_server_url: "https://server.example.com",
      }),
    ).toBe("https://realm.example.com");
  });

  it("falls back to server_jitsi_server_url", () => {
    expect(
      parseRegisterResponseJitsiServerUrl({
        realm_jitsi_server_url: null,
        server_jitsi_server_url: "http://jitsi.internal:8443/",
      }),
    ).toBe("http://jitsi.internal:8443");
  });

  it("treats default as unset for realm", () => {
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "",
        realm_jitsi_server_url: "default",
        server_jitsi_server_url: "https://meet.jit.si",
      }),
    ).toBe("https://meet.jit.si");
  });

  it("returns null when all fields missing or invalid", () => {
    expect(parseRegisterResponseJitsiServerUrl({})).toBeNull();
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "not-a-url",
      }),
    ).toBeNull();
    expect(
      parseRegisterResponseJitsiServerUrl({
        jitsi_server_url: "ftp://meet.example.com",
      }),
    ).toBeNull();
  });
});
