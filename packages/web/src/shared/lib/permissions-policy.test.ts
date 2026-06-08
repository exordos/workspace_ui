import { describe, expect, it } from "vitest";
import { buildPermissionsPolicyHeader } from "./permissions-policy";

describe("buildPermissionsPolicyHeader", () => {
  it("allows media features for self and public Jitsi by default", () => {
    const header = buildPermissionsPolicyHeader();

    expect(header).toContain('camera=(self "https://meet.jit.si")');
    expect(header).toContain('microphone=(self "https://meet.jit.si")');
    expect(header).toContain("fullscreen=(self)");
    expect(header).toContain("geolocation=()");
  });

  it("adds configured Jitsi domains to media allowlist", () => {
    const header = buildPermissionsPolicyHeader(
      "meet.genesis-core.tech",
      "realm-jitsi.example.com, https://server-jitsi.example.com",
    );

    expect(header).toContain('"https://meet.genesis-core.tech"');
    expect(header).toContain('"https://realm-jitsi.example.com"');
    expect(header).toContain('"https://server-jitsi.example.com"');
    expect(header).toContain('"https://meet.jit.si"');
  });

  it("normalizes configured domain and drops invalid values", () => {
    const validHeader = buildPermissionsPolicyHeader("https://meet.genesis-core.tech/rooms");
    const invalidConfiguredDomain = `javascript${":alert(1)"}`;
    const invalidHeader = buildPermissionsPolicyHeader(invalidConfiguredDomain);

    expect(validHeader).toContain('"https://meet.genesis-core.tech"');
    expect(validHeader).not.toContain("/rooms");
    expect(invalidHeader).not.toContain("javascript");
  });

  it("drops non-HTTPS configured Jitsi origins", () => {
    const header = buildPermissionsPolicyHeader("http://meet.genesis-core.tech");

    expect(header).not.toContain('"http://meet.genesis-core.tech"');
    expect(header).not.toContain('"https://meet.genesis-core.tech"');
  });
});
