import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { WorkspaceApiHttpError } from "~/shared/api/workspace-api-error";
import { formatUserFacingError } from "./format-user-error.lib";

describe("formatUserFacingError", () => {
  it("maps WorkspaceApiHttpError 4xx to errorStatus", () => {
    const err = new WorkspaceApiHttpError("Workspace API error: 404 Not Found", 404, null);
    expect(formatUserFacingError(err, "folder.createFailed")).toBe(
      t("app.errorStatus", { status: "404" }),
    );
  });

  it("maps WorkspaceApiHttpError 5xx to generic app.error", () => {
    const err = new WorkspaceApiHttpError("Workspace API error: 500", 500, null);
    expect(formatUserFacingError(err, "folder.createFailed")).toBe(t("app.error"));
  });

  it("maps network TypeError to app.networkError", () => {
    expect(formatUserFacingError(new TypeError("Failed to fetch"), "folder.createFailed")).toBe(
      t("app.networkError"),
    );
  });

  it("uses user-facing Error message when safe", () => {
    expect(formatUserFacingError(new Error("Channel not found"), "folder.createFailed")).toBe(
      "Channel not found",
    );
  });

  it("falls back to i18n key for internal errors", () => {
    expect(
      formatUserFacingError(new Error("Workspace API error: 403 Forbidden"), "folder.createFailed"),
    ).toBe(t("folder.createFailed"));
  });

  it("falls back for unknown values", () => {
    expect(formatUserFacingError("oops", "folder.deleteFailed")).toBe(t("folder.deleteFailed"));
  });
});
