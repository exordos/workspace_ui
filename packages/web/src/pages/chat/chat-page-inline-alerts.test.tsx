import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";

describe("ChatPageInlineAlerts", () => {
  it("показывает actionError и вызывает onDismissActionError по крестику", async () => {
    const user = userEvent.setup();
    const onDismissActionError = vi.fn();
    const onDismissSendError = vi.fn();

    render(
      <ChatPageInlineAlerts
        actionError="Failed to fetch"
        sendError={null}
        onDismissActionError={onDismissActionError}
        onDismissSendError={onDismissSendError}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismissActionError).toHaveBeenCalledTimes(1);
    expect(onDismissSendError).not.toHaveBeenCalled();
  });

  it("показывает sendError и вызывает onDismissSendError по крестику", async () => {
    const user = userEvent.setup();
    const onDismissActionError = vi.fn();
    const onDismissSendError = vi.fn();

    render(
      <ChatPageInlineAlerts
        actionError={null}
        sendError="Message not sent"
        onDismissActionError={onDismissActionError}
        onDismissSendError={onDismissSendError}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Message not sent");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismissSendError).toHaveBeenCalledTimes(1);
    expect(onDismissActionError).not.toHaveBeenCalled();
  });

  it("показывает оба алерта с отдельными кнопками закрытия", async () => {
    const user = userEvent.setup();
    const onDismissActionError = vi.fn();
    const onDismissSendError = vi.fn();

    render(
      <ChatPageInlineAlerts
        actionError="Action failed"
        sendError="Send failed"
        onDismissActionError={onDismissActionError}
        onDismissSendError={onDismissSendError}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent("Action failed");
    expect(alerts[1]).toHaveTextContent("Send failed");

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    expect(closeButtons).toHaveLength(2);

    await user.click(closeButtons[0]!);
    expect(onDismissActionError).toHaveBeenCalledTimes(1);
    expect(onDismissSendError).not.toHaveBeenCalled();

    await user.click(closeButtons[1]!);
    expect(onDismissSendError).toHaveBeenCalledTimes(1);
  });
});
