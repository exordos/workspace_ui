import { describe, expect, it } from "vitest";
import {
  assertMailFolderManageable,
  isDescendantMailboxPath,
  isProtectedMailFolderPath,
} from "./folder-guard.lib";
import {
  parseFolderPathPayload,
  parseMoveMailboxPayload,
  parseRenameFolderPayload,
} from "./validation.lib";

describe("mail-folder-guard.lib", () => {
  it("protects INBOX and system leaf folders", () => {
    expect(isProtectedMailFolderPath("INBOX")).toBe(true);
    expect(isProtectedMailFolderPath("Sent")).toBe(true);
    expect(isProtectedMailFolderPath("INBOX.Trash")).toBe(true);
    expect(isProtectedMailFolderPath("INBOX.Work")).toBe(false);
    expect(isProtectedMailFolderPath("Projects")).toBe(false);
  });

  it("assertMailFolderManageable throws for system folders", () => {
    expect(() => assertMailFolderManageable("INBOX")).toThrow(/system folder/i);
    expect(() => assertMailFolderManageable("Projects")).not.toThrow();
  });

  it("isDescendantMailboxPath detects nested paths", () => {
    expect(isDescendantMailboxPath("INBOX", "INBOX.Work", ".")).toBe(true);
    expect(isDescendantMailboxPath("Projects", "INBOX", ".")).toBe(false);
  });
});

describe("folder payload parsers", () => {
  it("parses rename folder payload", () => {
    expect(
      parseRenameFolderPayload({ path: "Projects", name: "Clients", delimiter: "." }),
    ).toEqual({ path: "Projects", name: "Clients", delimiter: "." });
  });

  it("parses move mailbox payload", () => {
    expect(
      parseMoveMailboxPayload({ path: "Projects.Client", parentPath: "Archive", delimiter: "." }),
    ).toEqual({ path: "Projects.Client", parentPath: "Archive", delimiter: "." });
  });

  it("parses folder path payload", () => {
    expect(parseFolderPathPayload({ path: "Projects" })).toEqual({ path: "Projects" });
  });
});
