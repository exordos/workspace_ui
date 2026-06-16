import { describe, expect, it } from "vitest";
import {
  buildVisibleMailFolderRows,
  detectMailFolderDelimiter,
  getMailFolderAncestorPaths,
  getMailFolderParentPath,
  joinMailFolderPath,
  resolveMailFolderExpandedPaths,
  resolveMailFolderExpandedPathsForList,
} from "./mail-folder-tree.lib";
import type { MailFolder } from "./mail.types";

function folder(path: string, overrides: Partial<MailFolder> = {}): MailFolder {
  const segment = path.includes(".") ? (path.split(".").pop() ?? path) : path;
  return {
    path,
    name: segment,
    unread: 0,
    total: 0,
    ...overrides,
  };
}

describe("mail-folder-tree.lib", () => {
  it("detectMailFolderDelimiter prefers dot when present", () => {
    expect(detectMailFolderDelimiter(["INBOX", "INBOX.Work", "Sent"])).toBe(".");
  });

  it("getMailFolderParentPath returns parent segment", () => {
    expect(getMailFolderParentPath("INBOX.Work", ".")).toBe("INBOX");
    expect(getMailFolderParentPath("INBOX", ".")).toBeNull();
  });

  it("joinMailFolderPath builds nested path", () => {
    expect(joinMailFolderPath("Projects", "Client", ".")).toBe("Projects.Client");
    expect(joinMailFolderPath("", "Projects", ".")).toBe("Projects");
  });

  it("buildVisibleMailFolderRows nests children under expanded parents", () => {
    const folders = [folder("INBOX"), folder("INBOX.Work", { unread: 2 }), folder("Sent")];
    const expanded = new Set(["INBOX"]);
    const rows = buildVisibleMailFolderRows(folders, ".", expanded);
    expect(rows.map((row) => row.folder.path)).toEqual(["INBOX", "INBOX.Work", "Sent"]);
    expect(rows[1]?.depth).toBe(1);
  });

  it("hides collapsed children", () => {
    const folders = [folder("INBOX"), folder("INBOX.Work")];
    const rows = buildVisibleMailFolderRows(folders, ".", new Set());
    expect(rows.map((row) => row.folder.path)).toEqual(["INBOX"]);
  });

  it("resolveMailFolderExpandedPaths includes ancestors of selection", () => {
    const expanded = resolveMailFolderExpandedPaths(new Set(), "INBOX.Work.Client", ".");
    expect([...expanded]).toEqual(expect.arrayContaining(["INBOX", "INBOX.Work"]));
  });

  it("resolveMailFolderExpandedPathsForList expands parents with children", () => {
    const folders = [folder("INBOX"), folder("INBOX.Work")];
    const expanded = resolveMailFolderExpandedPathsForList(folders, new Set(), "INBOX", ".");
    expect(expanded.has("INBOX")).toBe(true);
  });

  it("getMailFolderAncestorPaths lists parents up to root", () => {
    expect(getMailFolderAncestorPaths("INBOX.Work.Client", ".")).toEqual(["INBOX", "INBOX.Work"]);
  });
});
