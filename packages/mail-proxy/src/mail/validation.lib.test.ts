import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  parseCreateFolderPayload,
  parseMessageUid,
  parseSendMailPayload,
  parseSessionPayload,
  sanitizeFolderPath,
} from "./validation.lib";

describe("mail-validation.lib", () => {
  it("validates email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
  });

  it("parses session payload", () => {
    expect(parseSessionPayload({ email: "a@b.com", password: "secret" })).toEqual({
      email: "a@b.com",
      password: "secret",
    });
    expect(() => parseSessionPayload({ email: "bad", password: "x" })).toThrow(/Invalid email/);
  });

  it("parses send payload", () => {
    expect(
      parseSendMailPayload({
        to: "to@example.com",
        subject: "Hi",
        bodyHtml: "<p>Hello</p>",
      }),
    ).toEqual({
      to: "to@example.com",
      subject: "Hi",
      bodyHtml: "<p>Hello</p>",
      bodyText: undefined,
      cc: undefined,
      inReplyTo: undefined,
      references: undefined,
    });
    expect(
      parseSendMailPayload({ to: "to@example.com", subject: "Hi", body: "Hello" }),
    ).toEqual({
      to: "to@example.com",
      subject: "Hi",
      bodyHtml: "Hello",
      bodyText: undefined,
      cc: undefined,
      inReplyTo: undefined,
      references: undefined,
    });
  });

  it("sanitizes folder path", () => {
    expect(sanitizeFolderPath("")).toBe("INBOX");
    expect(sanitizeFolderPath("Sent")).toBe("Sent");
  });

  it("parses message uid", () => {
    expect(parseMessageUid("42")).toBe(42);
    expect(() => parseMessageUid("0")).toThrow();
  });

  it("parses nested create folder payload", () => {
    expect(
      parseCreateFolderPayload({
        name: "Client",
        parentPath: "Projects",
        delimiter: ".",
      }),
    ).toEqual({ path: "Projects.Client" });
    expect(parseCreateFolderPayload({ path: "Legacy.Path" })).toEqual({ path: "Legacy.Path" });
  });
});
