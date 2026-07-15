import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MailMessageSummary } from "~/entities/mail/mail.types";
import { MailMessageList } from "./mail-message-list.ui";

const MESSAGE: MailMessageSummary = {
  uid: "message-1",
  from: "Sender <sender@example.test>",
  subject: "Accessible row",
  snippet: "Preview",
  date: "2026-07-15T09:00:00.000Z",
  seen: false,
  flagged: false,
};

describe("MailMessageList", () => {
  it("uses a non-jumping skeleton layout while messages load", () => {
    render(<MailMessageList messages={[]} selectedUid={null} loading onSelectMessage={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading…");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the batch checkbox outside the message button", () => {
    render(
      <MailMessageList
        messages={[MESSAGE]}
        selectedUid={null}
        loading={false}
        batchMode
        selectedUids={[]}
        onSelectMessage={vi.fn()}
        onToggleSelectUid={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: MESSAGE.subject });
    expect(checkbox.closest("button")).toBeNull();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
  });

  it("exposes star and read controls as sibling actions", async () => {
    const user = userEvent.setup();
    const onToggleStar = vi.fn();
    const onToggleRead = vi.fn();

    render(
      <MailMessageList
        messages={[MESSAGE]}
        selectedUid={null}
        loading={false}
        onSelectMessage={vi.fn()}
        onToggleStar={onToggleStar}
        onToggleRead={onToggleRead}
      />,
    );

    await user.click(screen.getByRole("button", { name: /star/i }));
    await user.click(screen.getByRole("button", { name: /mark read/i }));

    expect(onToggleStar).toHaveBeenCalledWith(MESSAGE.uid);
    expect(onToggleRead).toHaveBeenCalledWith(MESSAGE.uid);
    expect(
      screen.getByRole("button", { name: /mark read/i }).closest('[role="option"]'),
    ).not.toBeNull();
  });
});
