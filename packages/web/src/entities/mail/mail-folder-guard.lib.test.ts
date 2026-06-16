import { describe, expect, it } from "vitest";
import {
  canManageMailFolder,
  isDescendantMailFolderPath,
  isProtectedMailFolder,
} from "./mail-folder-guard.lib";

describe("mail-folder-guard.lib", () => {
  it("flags system folders as protected", () => {
    expect(isProtectedMailFolder("INBOX")).toBe(true);
    expect(isProtectedMailFolder("Trash")).toBe(true);
    expect(isProtectedMailFolder("INBOX.Work")).toBe(false);
  });

  it("canManageMailFolder allows custom folders", () => {
    expect(canManageMailFolder("Projects")).toBe(true);
    expect(canManageMailFolder("Sent")).toBe(false);
  });

  it("isDescendantMailFolderPath detects nesting", () => {
    expect(isDescendantMailFolderPath("A", "A.B", ".")).toBe(true);
    expect(isDescendantMailFolderPath("A", "B", ".")).toBe(false);
  });
});
