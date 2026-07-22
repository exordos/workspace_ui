import { describe, expect, it } from "vitest";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { connectExternalAccountRequestError } from "./connect-external-account-error.lib";

describe("connectExternalAccountRequestError", () => {
  it("maps access denial to a dedicated user-facing error", () => {
    const error = new MessengerApiError("External resource access is forbidden", 403, {
      type: "ExternalResourceForbiddenError",
    });

    expect(connectExternalAccountRequestError(error)).toBe("forbidden");
  });

  it.each([
    [409, "duplicate"],
    [400, "invalid"],
    [401, "invalid"],
    [502, "unavailable"],
    [503, "unavailable"],
    [500, "connect"],
  ] as const)("maps status %i to %s", (status, expected) => {
    expect(connectExternalAccountRequestError(new MessengerApiError("failed", status, null))).toBe(
      expected,
    );
  });
});
