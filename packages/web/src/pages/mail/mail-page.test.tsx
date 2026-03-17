import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";

describe("MailPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders embeddable mail placeholder page by default", async () => {
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");

    renderWithProviders(<MailPage />);

    const frame = screen.getByTitle(/mail/i);
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute("src", expect.stringContaining("/embeds/mail-placeholder.html"));
  });

  it("uses configurable mail embed URL", async () => {
    vi.stubEnv("VITE_MAIL_EMBED_URL", "https://mail.example.com/mock.html");
    vi.stubEnv("VITE_EMBED_ALLOWED_ORIGINS", "https://mail.example.com");
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");

    renderWithProviders(<MailPage />);

    expect(screen.getByTitle(/mail/i)).toHaveAttribute("src", "https://mail.example.com/mock.html");
  });
});
