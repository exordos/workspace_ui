import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import type { Locale } from "~/i18n/i18n";
import { FloatingScrollToBottomButton } from "./floating-scroll-to-bottom-button";

describe("FloatingScrollToBottomButton", () => {
  afterEach(() => setLocale("en"));

  it("renders without badge when unread count is zero", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={0} />);

    expect(screen.getByRole("button", { name: /scroll to bottom/i })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows unread badge and aria label when count is positive", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={3} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 unread messages/i })).toBeInTheDocument();
  });

  it.each<{ locale: Locale; count: number; formatted: string; label: string }>([
    { locale: "en", count: 1001, formatted: "1k+", label: "Scroll to bottom, 1k+ unread messages" },
    { locale: "en", count: 2002, formatted: "2k+", label: "Scroll to bottom, 2k+ unread messages" },
    {
      locale: "ru",
      count: 1001,
      formatted: "1k+",
      label: "Прокрутить вниз, 1k+ непрочитанных сообщений",
    },
    {
      locale: "ru",
      count: 2002,
      formatted: "2k+",
      label: "Прокрутить вниз, 2k+ непрочитанных сообщений",
    },
  ])(
    "formats count $count in its badge and accessible name in $locale",
    ({ locale, count, formatted, label }) => {
      setLocale(locale);
      render(<FloatingScrollToBottomButton onClick={vi.fn()} unreadCount={count} />);

      expect(screen.getByText(formatted)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      expect(screen.queryByText(String(count))).not.toBeInTheDocument();
    },
  );

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /2 unread messages/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
