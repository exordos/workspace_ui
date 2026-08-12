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
        routeResolveError={null}
        actionError="Failed to fetch"
        sendError={null}
        onDismissRouteResolveError={vi.fn()}
        onDismissActionError={onDismissActionError}
        onDismissSendError={onDismissSendError}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.getByRole("alert")).toHaveClass("bg-composer-outer");
    expect(screen.getByRole("alert")).not.toHaveClass("px-4", "py-2.5", "py-1.5");
    expect(screen.getByRole("alert")).not.toHaveClass("text-notice-base");
    const strip = screen.getByRole("alert").firstElementChild;
    expect(strip).toHaveClass("bg-composer-outer", "px-2", "py-2");
    expect(strip).not.toHaveClass("bg-bg/50");
    expect(screen.getByRole("alert").querySelector('[data-notice-marker="danger"]')).toHaveClass(
      "bg-danger",
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "shrink-0",
      "rounded",
      "p-1",
      "text-text-muted",
    );
    expect(screen.getByRole("button", { name: "Close" })).not.toHaveClass(
      "p-0.5",
      "opacity-80",
      "border-danger",
      "bg-danger/10",
      "text-danger",
    );

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
        routeResolveError={null}
        actionError={null}
        sendError="Message not sent"
        onDismissRouteResolveError={vi.fn()}
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
        routeResolveError={null}
        actionError="Action failed"
        sendError="Send failed"
        onDismissRouteResolveError={vi.fn()}
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

  it("показывает routeResolveError отдельной строкой", async () => {
    const user = userEvent.setup();
    const onDismissRouteResolveError = vi.fn();

    render(
      <ChatPageInlineAlerts
        routeResolveError="Channel not found or unavailable"
        actionError={null}
        sendError={null}
        onDismissRouteResolveError={onDismissRouteResolveError}
        onDismissActionError={vi.fn()}
        onDismissSendError={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Channel not found or unavailable");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismissRouteResolveError).toHaveBeenCalledTimes(1);
  });

  it("сохраняет только внешние скругления при соединении с соседними панелями", () => {
    render(
      <ChatPageInlineAlerts
        routeResolveError="Route failed"
        actionError="Action failed"
        sendError="Send failed"
        onDismissRouteResolveError={vi.fn()}
        onDismissActionError={vi.fn()}
        onDismissSendError={vi.fn()}
        joinedAbove
        joinedBelow
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]).toHaveClass("rounded-none", "border-b", "border-border-subtle");
    expect(alerts[1]).toHaveClass("rounded-none", "border-b", "border-border-subtle");
    expect(alerts[2]).toHaveClass("rounded-none", "border-b", "border-border-subtle");
    expect(alerts[0]).not.toHaveClass("border", "border-t");
    expect(alerts[1]).not.toHaveClass("border", "border-t");
    expect(alerts[2]).not.toHaveClass("border", "border-t");
  });

  it("сохраняет полный контур у отдельной карточки", () => {
    render(
      <ChatPageInlineAlerts
        routeResolveError="Route failed"
        actionError={null}
        sendError={null}
        onDismissRouteResolveError={vi.fn()}
        onDismissActionError={vi.fn()}
        onDismissSendError={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveClass("rounded-xl", "border", "border-border-subtle");
    expect(screen.getByRole("alert")).not.toHaveClass("border-b");
  });
});
