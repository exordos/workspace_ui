import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeWorkspaceMeetUrl,
  useWorkspaceJitsiSettingsStore,
} from "./jitsi-call-settings.model";

describe("workspace Jitsi settings store", () => {
  afterEach(() => {
    useWorkspaceJitsiSettingsStore.getState().clear();
  });

  it("normalizes Workspace meet_url values", () => {
    expect(normalizeWorkspaceMeetUrl(" https://meet.example.com/room ")).toBe(
      "https://meet.example.com",
    );
    expect(normalizeWorkspaceMeetUrl("ftp://meet.example.com")).toBeNull();
    expect(normalizeWorkspaceMeetUrl("")).toBeNull();
  });

  it("stores meet_url by Workspace owner key", () => {
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl("owner-a", "https://meet.example.com/");

    expect(useWorkspaceJitsiSettingsStore.getState().getWorkspaceMeetUrl("owner-a")).toBe(
      "https://meet.example.com",
    );
    expect(useWorkspaceJitsiSettingsStore.getState().getWorkspaceMeetUrl("owner-b")).toBeNull();
  });
});
