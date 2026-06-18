import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMailcowSogoUrl } from "./env.lib";

describe("mail-env.lib", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  it("defaults SOGo URL to https://mail.example.test when unset", async () => {
    delete process.env.MAILCOW_SOGO_URL;
    delete process.env.MAILCOW_HOSTNAME;
    vi.resetModules();
    const { resolveMailcowSogoUrl: resolve } = await import("./env.lib");
    expect(resolve()).toBe("https://mail.example.test");
  });

  it("uses MAILCOW_SOGO_URL when set", async () => {
    process.env.MAILCOW_SOGO_URL = "https://mail.corp.test/";
    vi.resetModules();
    const { resolveMailcowSogoUrl: resolve } = await import("./env.lib");
    expect(resolve()).toBe("https://mail.corp.test");
  });

  it("derives from MAILCOW_HOSTNAME when SOGO URL unset", async () => {
    delete process.env.MAILCOW_SOGO_URL;
    process.env.MAILCOW_HOSTNAME = "mail.my.test";
    vi.resetModules();
    const { resolveMailcowSogoUrl: resolve } = await import("./env.lib");
    expect(resolve()).toBe("https://mail.my.test");
  });
});
