import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";

describe("MailPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders same-origin placeholder embed when no external URL is configured", async () => {
    vi.stubEnv("VITE_MAIL_EMBED_URL", "");
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");

    renderWithProviders(<MailPage />);

    expect(screen.getByTitle(/mail/i)).toHaveAttribute(
      "src",
      expect.stringContaining("embeds/mail-placeholder.html"),
    );
    expect(screen.queryByText(/temporarily unavailable in web mode/i)).not.toBeInTheDocument();
  });

  it("renders unavailable fallback when embed URL origin is not allowed", async () => {
    vi.stubEnv("VITE_MAIL_EMBED_URL", "https://evil.example.com/mail.html");
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");

    renderWithProviders(<MailPage />);

    expect(screen.queryByTitle(/mail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mail/i })).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable in web mode/i)).toBeInTheDocument();
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
