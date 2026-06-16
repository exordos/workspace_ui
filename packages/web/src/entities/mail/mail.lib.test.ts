import { describe, expect, it } from "vitest";
import { MailApiError } from "./mail.api";
import {
  compareMailFolders,
  getMailFolderIconName,
  isMailApiConfigured,
  isMailUnauthorizedError,
  sortMailFolders,
} from "./mail.lib";
import type { MailFolder } from "./mail.types";

describe("mail.lib", () => {
  it("sorts folders with INBOX first", () => {
    const folders: MailFolder[] = [
      { path: "Sent", name: "Sent", unread: 0, total: 1 },
      { path: "INBOX", name: "Inbox", unread: 2, total: 5 },
    ];
    expect(sortMailFolders(folders).map((f) => f.path)).toEqual(["INBOX", "Sent"]);
  });

  it("compareMailFolders orders known folders", () => {
    const inbox: MailFolder = { path: "INBOX", name: "Inbox", unread: 0, total: 0 };
    const sent: MailFolder = { path: "Sent", name: "Sent", unread: 0, total: 0 };
    expect(compareMailFolders(inbox, sent)).toBeLessThan(0);
  });

  it("detects configured mail API origin", () => {
    expect(isMailApiConfigured("/mail-api")).toBe(true);
    expect(isMailApiConfigured("")).toBe(false);
  });

  it("maps known folder paths to icons", () => {
    expect(getMailFolderIconName("INBOX")).toBe("mail");
    expect(getMailFolderIconName("Sent")).toBe("send");
    expect(getMailFolderIconName("Trash")).toBe("delete");
    expect(getMailFolderIconName("Custom")).toBe("folder");
  });

  it("detects unauthorized mail API errors", () => {
    expect(isMailUnauthorizedError(new MailApiError("Unauthorized", 401))).toBe(true);
    expect(isMailUnauthorizedError(new Error("Unauthorized"))).toBe(true);
    expect(isMailUnauthorizedError(new MailApiError("Not found", 404))).toBe(false);
  });
});
