import { describe, expect, it } from "vitest";
import { shouldBootstrapFolderSyncForLayout } from "./layout-folder-sync-bootstrap.lib";

describe("shouldBootstrapFolderSyncForLayout", () => {
  it("runs when user switched org even if chat list is still loading", () => {
    expect(
      shouldBootstrapFolderSyncForLayout({
        folderSyncInstanceId: "inst-a",
        currentInstanceId: "inst-b",
        currentUserStatus: "loading",
      }),
    ).toBe(true);
  });

  it("waits for ready on same instance so first login does not race without credentials", () => {
    expect(
      shouldBootstrapFolderSyncForLayout({
        folderSyncInstanceId: "inst-a",
        currentInstanceId: "inst-a",
        currentUserStatus: "loading",
      }),
    ).toBe(false);
  });

  it("runs when same instance becomes ready", () => {
    expect(
      shouldBootstrapFolderSyncForLayout({
        folderSyncInstanceId: "inst-a",
        currentInstanceId: "inst-a",
        currentUserStatus: "ready",
      }),
    ).toBe(true);
  });

  it("does not run for empty instance id", () => {
    expect(
      shouldBootstrapFolderSyncForLayout({
        folderSyncInstanceId: null,
        currentInstanceId: "   ",
        currentUserStatus: "ready",
      }),
    ).toBe(false);
  });
});
