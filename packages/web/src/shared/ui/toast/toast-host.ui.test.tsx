import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetToastStateForTests, useToastStore } from "~/shared/lib/toast/toast.model";
import { ToastHost } from "./toast-host.ui";

describe("ToastHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToastStateForTests();
  });

  afterEach(() => {
    resetToastStateForTests();
    vi.useRealTimers();
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(<ToastHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders error toast with alert role", () => {
    useToastStore.getState().push("Could not create folder", "error");
    render(<ToastHost />);
    expect(screen.getByTestId("toast-host")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not create folder");
  });

  it("removes toast after auto-dismiss", () => {
    useToastStore.getState().push("Temporary", "success");
    render(<ToastHost />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("toast-success-icon")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
