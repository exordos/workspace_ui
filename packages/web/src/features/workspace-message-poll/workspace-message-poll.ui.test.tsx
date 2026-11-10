import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessagePoll } from "./workspace-message-poll.ui";
import type { WorkspacePoll } from "./workspace-message-poll.types";

const poll: WorkspacePoll = {
  kind: "poll",
  multipleAnswers: false,
  id: "poll",
  anonymous: false,
  allowRevote: false,
  allowAddingOptions: false,
  resultsVisibility: "after_vote",
  closed: false,
  voterCount: 4,
  questions: [
    {
      id: "first",
      text: "First question",
      voterCount: 4,
      selectedOptionIds: ["a"],
      correctOptionIds: ["a"],
      options: [
        { id: "a", text: "Alpha", votes: 3 },
        { id: "b", text: "Beta", votes: 1 },
      ],
    },
    {
      id: "second",
      text: "Second question",
      voterCount: 2,
      selectedOptionIds: [],
      correctOptionIds: ["c"],
      options: [
        { id: "c", text: "Gamma", votes: 1 },
        { id: "d", text: "Delta", votes: 1 },
      ],
    },
  ],
};
beforeEach(() => setLocale("en"));
describe("WorkspaceMessagePoll", () => {
  it("shows at most five voter avatars and keeps the voter-list action", () => {
    const recentVoters = Array.from({ length: 7 }, (_, index) => ({
      id: `voter-${index}`,
      name: `Voter ${index}`,
    }));
    const preview = {
      ...poll,
      questions: poll.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({ ...option, recentVoters })),
      })),
    };
    const onLoadVoters = vi.fn();
    const { rerender } = render(
      <WorkspaceMessagePoll poll={preview} onLoadVoters={onLoadVoters} />,
    );
    expect(screen.getAllByTitle("Voter 0")).toHaveLength(2);
    expect(screen.queryByTitle("Voter 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    expect(onLoadVoters).toHaveBeenCalledWith("first", "a", false);
    rerender(<WorkspaceMessagePoll poll={preview} readOnly onLoadVoters={onLoadVoters} />);
    expect(screen.queryByTitle("Voter 0")).not.toBeInTheDocument();
    rerender(
      <WorkspaceMessagePoll poll={{ ...preview, anonymous: true }} onLoadVoters={onLoadVoters} />,
    );
    expect(screen.queryByTitle("Voter 0")).not.toBeInTheDocument();
  });
  it.each([false, true])(
    "applies shared multipleAnswers=%s without locking another question",
    (multipleAnswers) => {
      const onVote = vi.fn();
      render(<WorkspaceMessagePoll poll={{ ...poll, multipleAnswers }} onVote={onVote} />);
      const first = screen.getByRole("button", { name: "Alpha · Correct answer" });
      expect(first).toBeDisabled();
      const alternative = screen.getByRole("button", { name: "Beta" });
      if (multipleAnswers) expect(alternative).toBeEnabled();
      else expect(alternative).toBeDisabled();
      const second = screen.getByRole("button", { name: "Gamma" });
      expect(second).toBeEnabled();
      fireEvent.click(second);
      expect(onVote).toHaveBeenCalledWith("second", "c", true);
      expect(first).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getAllByText(multipleAnswers ? /Choose multiple options/ : /Choose one option/),
      ).toHaveLength(1);
    },
  );

  it("does not leak participation counts before the corresponding answers", () => {
    render(
      <WorkspaceMessagePoll
        poll={{ ...poll, questions: poll.questions.map((q) => ({ ...q, selectedOptionIds: [] })) }}
      />,
    );
    expect(screen.queryByText(/Participants:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total participants:/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Results after voting")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Answer status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Poll status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Vote counts" })).not.toBeInTheDocument();
  });
  it("shows one unambiguous correctness mark per selected option", () => {
    const { rerender } = render(<WorkspaceMessagePoll poll={poll} />);
    const correct = screen.getByRole("button", { name: "Alpha · Correct answer" });
    expect(correct).toHaveAttribute("aria-pressed", "true");
    expect(within(correct).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(correct.querySelector('.checkbox-indicator[data-tone="success"]')).toBeInTheDocument();
    const incorrectPoll = {
      ...poll,
      questions: poll.questions.map((q) =>
        q.id === "first" ? { ...q, selectedOptionIds: ["b"] } : q,
      ),
    };
    rerender(<WorkspaceMessagePoll poll={incorrectPoll} />);
    const incorrect = screen.getByRole("button", { name: "Beta · Incorrect answer" });
    expect(incorrect).toHaveAttribute("aria-pressed", "true");
    expect(
      incorrect.querySelector('.checkbox-indicator[data-tone="success"]'),
    ).not.toBeInTheDocument();
    expect(within(incorrect).getByText("Beta", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Your answer:/)).not.toBeInTheDocument();
  });
  it("marks a selected option when no correct answers are configured", () => {
    render(
      <WorkspaceMessagePoll
        poll={{
          ...poll,
          questions: poll.questions.map((question) => ({
            ...question,
            correctOptionIds: undefined,
          })),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps selection confirmed by props and submits each independent click", () => {
    const onVote = vi.fn();
    render(<WorkspaceMessagePoll poll={poll} onVote={onVote} />);
    expect(screen.getByRole("button", { name: "Beta" })).toBeDisabled();
    const option = screen.getByRole("button", { name: "Gamma" });
    fireEvent.click(option);
    expect(onVote).toHaveBeenCalledWith("second", "c", true);
    expect(option).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gamma.*Correct answer/ })).not.toBeInTheDocument();
  });
  it("reveals closed results without revealing correctness of unanswered questions", () => {
    render(<WorkspaceMessagePoll poll={{ ...poll, closed: true }} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gamma" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Alpha · Correct answer" })).toBeInTheDocument();
  });
  it("supports additive multiple choice without revoting and scopes pending to one question", () => {
    const answered = {
      ...poll,
      multipleAnswers: true,
      questions: poll.questions.map((q) =>
        q.id === "second" ? { ...q, selectedOptionIds: ["c"] } : q,
      ),
    };
    const { rerender } = render(<WorkspaceMessagePoll poll={answered} onVote={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Gamma/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delta" })).toBeEnabled();
    rerender(
      <WorkspaceMessagePoll
        poll={{ ...answered, allowRevote: true }}
        pendingQuestionIds={["first"]}
        onVote={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Gamma/ })).toBeEnabled();
  });
  it("never exposes voters in anonymous or read-only snapshots", () => {
    const onLoadVoters = vi.fn();
    render(
      <WorkspaceMessagePoll poll={{ ...poll, anonymous: true }} onLoadVoters={onLoadVoters} />,
    );
    expect(screen.queryByRole("button", { name: /Who chose/ })).not.toBeInTheDocument();
    expect(onLoadVoters).not.toHaveBeenCalled();
  });
  it("opens the summary voter list and allows switching answers", () => {
    const onLoadVoters = vi.fn();
    const first = poll.questions[0]!;
    render(
      <WorkspaceMessagePoll
        poll={{ ...poll, questions: [{ ...first, correctOptionIds: undefined }] }}
        onLoadVoters={onLoadVoters}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "4 participants · View votes" }));
    expect(onLoadVoters).toHaveBeenLastCalledWith("first", "a", false);
    fireEvent.click(screen.getByRole("combobox", { name: "Answer" }));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onLoadVoters).toHaveBeenLastCalledWith("first", "b", false);
  });
  it("routes identical answer labels to the selected question in the voter list", () => {
    const onLoadVoters = vi.fn();
    render(
      <WorkspaceMessagePoll
        poll={{
          ...poll,
          resultsVisibility: "always",
          questions: poll.questions.map((question) => ({
            ...question,
            correctOptionIds: undefined,
            options: question.options.map((option, index) => ({
              ...option,
              text: index === 0 ? "Yes" : "No",
            })),
          })),
        }}
        onLoadVoters={onLoadVoters}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "4 participants · View votes" }));
    const trigger = screen.getByRole("combobox", { name: "Answer" });
    fireEvent.click(trigger);
    const question = within(screen.getByRole("listbox")).getByRole("group", {
      name: "Second question",
    });
    fireEvent.click(within(question).getByRole("option", { name: "No" }));
    expect(onLoadVoters).toHaveBeenLastCalledWith("second", "d", false);
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Voters" })).toBeInTheDocument();
  });
  it("shows the actual closure time and hides the active voting description", () => {
    render(
      <WorkspaceMessagePoll poll={{ ...poll, closed: true, closedAt: "2026-11-10T12:00:00Z" }} />,
    );
    expect(screen.getByText("Poll closed")).toBeInTheDocument();
    expect(screen.queryByText(/Choose one option/)).not.toBeInTheDocument();
    expect(screen.getByText(/Closed November 10/).closest("time")).toHaveAttribute(
      "dateTime",
      "2026-11-10T12:00:00Z",
    );
  });
  it("uses per-question participants as percentage denominator", () => {
    render(
      <WorkspaceMessagePoll
        poll={{
          ...poll,
          multipleAnswers: true,
          resultsVisibility: "always",
          questions: poll.questions.map((q) =>
            q.id === "second"
              ? { ...q, options: q.options.map((o) => (o.id === "c" ? { ...o, votes: 2 } : o)) }
              : q,
          ),
        }}
      />,
    );
    const second = screen.getByRole("group", { name: "Second question" });
    expect(within(second).getByText("100%")).toBeInTheDocument();
    expect(within(second).getByText("50%")).toBeInTheDocument();
  });
});
