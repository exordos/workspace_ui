import { describe, expect, it } from "vitest";
import {
  buildCreateFolderPath,
  isValidEmail,
  parseSendMailPayload,
  parseSessionPayload,
  sanitizeFolderPath,
} from "./mail-validation.lib";

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
  });

  it("sanitizes folder path", () => {
    expect(sanitizeFolderPath("")).toBe("INBOX");
    expect(sanitizeFolderPath("Sent")).toBe("Sent");
  });

  it("builds nested create folder path", () => {
    expect(buildCreateFolderPath({ name: "Client", parentPath: "Projects" }, ".")).toEqual(
      "Projects.Client",
    );
  });
});
