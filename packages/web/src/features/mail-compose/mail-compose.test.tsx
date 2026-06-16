import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildNewComposeState } from "~/entities/mail/mail-compose.lib";
import { MailComposeDialog } from "./mail-compose.ui";

describe("MailComposeDialog", () => {
  it("renders header close button", () => {
    render(
      <MailComposeDialog
        open
        mode="new"
        initial={buildNewComposeState()}
        sending={false}
        error={null}
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("clears fields when dialog closes after send", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <MailComposeDialog
        open
        mode="new"
        initial={buildNewComposeState()}
        sending={false}
        error={null}
        onOpenChange={onOpenChange}
        onSend={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^to$/i), "user@example.test");
    await user.type(screen.getByLabelText(/subject/i), "Hello");

    rerender(
      <MailComposeDialog
        open={false}
        mode="new"
        initial={buildNewComposeState()}
        sending={false}
        error={null}
        onOpenChange={onOpenChange}
        onSend={vi.fn()}
      />,
    );

    rerender(
      <MailComposeDialog
        open
        mode="new"
        initial={buildNewComposeState()}
        sending={false}
        error={null}
        onOpenChange={onOpenChange}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/^to$/i)).toHaveValue("");
    expect(screen.getByLabelText(/subject/i)).toHaveValue("");
  });
});
