import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoveTopicToStreamDialog } from "./move-topic-to-stream-dialog.ui";

const baseProps = {
  open: true,
  sourceChannelName: "general",
  targetStreamId: "20",
  onTargetStreamIdChange: vi.fn(),
  targetStreamOptions: [{ streamId: 20, name: "dev" }],
  topicName: "incident",
  onTopicNameChange: vi.fn(),
  pending: false,
  onOpenChange: vi.fn(),
  onSubmit: vi.fn(),
};

describe("MoveTopicToStreamDialog", () => {
  it("passes valid submit to the caller", () => {
    const onSubmit = vi.fn();

    render(<MoveTopicToStreamDialog {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit unsupported action while input is incomplete or pending", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <MoveTopicToStreamDialog {...baseProps} targetStreamId="" onSubmit={onSubmit} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<MoveTopicToStreamDialog {...baseProps} pending onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
