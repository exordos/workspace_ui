import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { ErrorBoundary, PageErrorFallback } from "./error-boundary";

describe("ErrorBoundary", () => {
  it("invokes render-prop fallback with resetErrorBoundary and remounts children after retry", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    function Child({ fail }: { fail: boolean }) {
      if (fail) throw new Error("child boom");
      return <div>child-ok</div>;
    }

    function Harness() {
      const [fail, setFail] = useState(true);
      return (
        <ErrorBoundary
          fallback={({ resetErrorBoundary }) => (
            <button
              type="button"
              onClick={() => {
                setFail(false);
                resetErrorBoundary();
                onReset();
              }}
            >
              boundary-retry
            </button>
          )}
        >
          <Child fail={fail} />
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("button", { name: "boundary-retry" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "boundary-retry" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("child-ok")).toBeInTheDocument();
  });

  it("renders static element fallback when fallback is a React element", () => {
    const Boom: React.FC = () => {
      throw new Error("x");
    };
    render(
      <ErrorBoundary fallback={<div>static-fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("static-fallback")).toBeInTheDocument();
  });
});

describe("PageErrorFallback", () => {
  it("shows retry and reload when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<PageErrorFallback onRetry={onRetry} />);
    expect(screen.getByText(t("app.pageLoadError"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("app.retry") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("app.reload") })).toBeInTheDocument();
  });

  it("shows only reload when onRetry is omitted", () => {
    render(<PageErrorFallback />);
    expect(screen.queryByRole("button", { name: t("app.retry") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("app.reload") })).toBeInTheDocument();
  });
});
