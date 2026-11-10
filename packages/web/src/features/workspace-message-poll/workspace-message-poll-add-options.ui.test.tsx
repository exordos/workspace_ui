import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessagePoll } from "./workspace-message-poll.ui";
import type { WorkspacePoll } from "./workspace-message-poll.types";

const poll: WorkspacePoll = {
  kind: "poll",
  id: "poll",
  multipleAnswers: false,
  anonymous: false,
  allowRevote: false,
  allowAddingOptions: true,
  resultsVisibility: "always",
  closed: false,
  voterCount: 0,
  questions: ["first", "second"].map((id) => ({
    id,
    text: `${id} question`,
    voterCount: 0,
    selectedOptionIds: [],
    options: [
      { id: `${id}-a`, text: "Alpha", votes: 0 },
      { id: `${id}-b`, text: "Beta", votes: 0 },
    ],
  })),
};

beforeEach(() => setLocale("en"));

describe("poll answer additions", () => {
  it("adds to the chosen question, preserves a failed draft and allows retry", async () => {
    const onAddOption = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    render(<WorkspaceMessagePoll poll={poll} onAddOption={onAddOption} />);
    const question = within(screen.getByRole("group", { name: "second question" }));
    const input = question.getByRole("textbox", { name: "New option" });
    expect(input).toHaveAttribute("placeholder", "Add an answer option…");
    expect(question.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddOption).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  Another answer  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddOption).toHaveBeenCalledWith("second", "Another answer");
    expect(await question.findByRole("alert")).toBeVisible();
    expect(input).toHaveValue("  Another answer  ");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(input).toHaveValue(""));
    expect(input).toHaveFocus();
    expect(onAddOption).toHaveBeenCalledTimes(2);
    expect(question.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Another answer", { exact: true })).not.toBeInTheDocument();
  });

  it("blocks additions while that question is saving without clearing its draft", () => {
    const onAddOption = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<WorkspaceMessagePoll poll={poll} onAddOption={onAddOption} />);
    const first = within(screen.getByRole("group", { name: "first question" }));
    const input = first.getByRole("textbox", { name: "New option" });
    fireEvent.change(input, { target: { value: "Draft" } });
    rerender(
      <WorkspaceMessagePoll poll={poll} onAddOption={onAddOption} pendingQuestionIds={["first"]} />,
    );
    expect(input).toBeDisabled();
    expect(input).toHaveValue("Draft");
    fireEvent.submit(input.closest("form")!);
    expect(onAddOption).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("group", { name: "second question" })).getByRole("textbox", {
        name: "New option",
      }),
    ).toBeEnabled();
    rerender(<WorkspaceMessagePoll poll={poll} onAddOption={onAddOption} />);
    expect(input).toBeEnabled();
    expect(input).toHaveValue("Draft");
  });

  it.each([{ allowAddingOptions: false }, { closed: true }, { closesAt: "2000-01-01T00:00:00Z" }])(
    "hides additions when the poll disallows them: %j",
    (settings) => {
      render(<WorkspaceMessagePoll poll={{ ...poll, ...settings }} onAddOption={vi.fn()} />);
      expect(screen.queryByRole("textbox", { name: "New option" })).not.toBeInTheDocument();
    },
  );

  it("hides additions in a read-only snapshot", () => {
    render(<WorkspaceMessagePoll poll={poll} readOnly onAddOption={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "New option" })).not.toBeInTheDocument();
  });

  it("respects the server limit of twenty options independently for each question", () => {
    render(
      <WorkspaceMessagePoll
        poll={{
          ...poll,
          questions: poll.questions.map((question) => ({
            ...question,
            options: Array.from({ length: question.id === "first" ? 20 : 19 }, (_, index) => ({
              id: `${question.id}-${index}`,
              text: `Answer ${index}`,
              votes: 0,
            })),
          })),
        }}
        onAddOption={vi.fn()}
      />,
    );
    expect(
      within(screen.getByRole("group", { name: "first question" })).queryByRole("textbox", {
        name: "New option",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "second question" })).getByRole("textbox", {
        name: "New option",
      }),
    ).toBeEnabled();
  });

  it("keeps Shift+Enter and IME confirmation as text input and blocks repeated submissions", async () => {
    let finish!: () => void;
    const onAddOption = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<WorkspaceMessagePoll poll={poll} onAddOption={onAddOption} />);
    const question = within(screen.getByRole("group", { name: "first question" }));
    const input = question.getByRole("textbox", { name: "New option" });
    fireEvent.change(input, { target: { value: "Friday\nafter lunch" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onAddOption).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);
    expect(onAddOption).toHaveBeenCalledExactlyOnceWith("first", "Friday\nafter lunch");
    expect(input).toBeDisabled();
    expect(input).toHaveValue("Friday\nafter lunch");
    finish();
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue("");
  });
});
