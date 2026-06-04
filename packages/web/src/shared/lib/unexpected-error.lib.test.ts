import { afterEach, describe, expect, it, vi } from "vitest";
import { reportUnexpectedError } from "./unexpected-error.lib";

const captureException = vi.fn();

vi.mock("~/shared/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

describe("reportUnexpectedError", () => {
  afterEach(() => {
    captureException.mockClear();
  });

  it("captures Error instances with scope context", () => {
    const err = new Error("boom");
    reportUnexpectedError("test-scope", err, { task: "init" });
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ scope: "test-scope", task: "init" }),
    );
  });

  it("wraps non-Error values", () => {
    reportUnexpectedError("test-scope", "plain failure");
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plain failure" }),
      expect.objectContaining({ scope: "test-scope", originalError: "plain failure" }),
    );
  });
});
