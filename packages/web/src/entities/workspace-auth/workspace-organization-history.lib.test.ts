import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceOrganizationHistory,
  recordSuccessfulWorkspaceOrganization,
} from "./workspace-organization-history.lib";

const STORAGE_KEY = "workspace-organization-history-v1";

describe("successful Workspace organization history", () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => vi.restoreAllMocks());

  it("stores only canonical origins in recent login order without duplicates", () => {
    recordSuccessfulWorkspaceOrganization("https://FIRST.example:443/api?token=private#user");
    recordSuccessfulWorkspaceOrganization("http://localhost:8080/");
    recordSuccessfulWorkspaceOrganization("https://first.example/json");

    expect(readWorkspaceOrganizationHistory()).toEqual([
      "https://first.example",
      "http://localhost:8080",
    ]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      version: 1,
      origins: ["https://first.example", "http://localhost:8080"],
    });
  });

  it("reads persisted history after a module reload", async () => {
    recordSuccessfulWorkspaceOrganization("https://workspace.example");
    vi.resetModules();
    const reloaded = await import("./workspace-organization-history.lib");

    expect(reloaded.readWorkspaceOrganizationHistory()).toEqual(["https://workspace.example"]);
  });

  it.each(["broken JSON", "null", "[]", '{"version":2,"origins":[]}', '{"version":1}'])(
    "ignores malformed or unsupported storage: %s",
    (value) => {
      localStorage.setItem(STORAGE_KEY, value);
      expect(readWorkspaceOrganizationHistory()).toEqual([]);
      recordSuccessfulWorkspaceOrganization("https://workspace.example");
      expect(readWorkspaceOrganizationHistory()).toEqual(["https://workspace.example"]);
    },
  );

  it("sanitizes stored rows and excludes unsupported schemes", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        origins: [
          null,
          42,
          "https://user:password@WORKSPACE.example/api?token=private",
          "https://workspace.example/",
          "data:text/plain,invalid",
          "ftp://workspace.example",
          "not a URL",
        ],
      }),
    );

    expect(readWorkspaceOrganizationHistory()).toEqual(["https://workspace.example"]);
    recordSuccessfulWorkspaceOrganization("https://next.example");
    expect(localStorage.getItem(STORAGE_KEY)).not.toMatch(/user|password|private/);
  });

  it.each(["", "not a URL", "file:///private/tmp", "data:text/plain,invalid"])(
    "does not store invalid origins: %s",
    (value) => {
      recordSuccessfulWorkspaceOrganization(value);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    },
  );

  it("handles restricted storage reads and writes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });

    expect(readWorkspaceOrganizationHistory()).toEqual([]);
    expect(() => recordSuccessfulWorkspaceOrganization("https://workspace.example")).not.toThrow();
  });
});
