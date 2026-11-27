import { useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { visiblePollVoterQuestions } from "./workspace-message-poll-adapter.lib";
import { WorkspaceMessagePoll } from "./workspace-message-poll.ui";
import type { PollVoterTarget, WorkspacePoll } from "./workspace-message-poll.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function fixture(russian: boolean, answered: boolean): WorkspacePoll {
  return {
    kind: "poll",
    multipleAnswers: true,
    id: "preview-poll",
    anonymous: false,
    allowRevote: true,
    allowAddingOptions: false,
    resultsVisibility: "after_vote",
    closed: false,
    voterCount: 26,
    questions: [
      {
        id: "schedule",
        text: russian ? "Когда проведём встречу команды?" : "When should we meet?",
        voterCount: 24,
        selectedOptionIds: answered ? ["wednesday"] : [],
        options: [
          { id: "tuesday", text: russian ? "Вторник, 11:00" : "Tuesday, 11:00", votes: 6 },
          { id: "wednesday", text: russian ? "Среда, 14:00" : "Wednesday, 14:00", votes: 16 },
          { id: "thursday", text: russian ? "Четверг, 16:00" : "Thursday, 16:00", votes: 2 },
        ],
      },
      {
        id: "topics",
        text: russian ? "Какие темы обсудим?" : "Which topics should we discuss?",
        voterCount: 20,
        selectedOptionIds: answered ? ["plans", "feedback"] : [],
        options: [
          { id: "plans", text: russian ? "Планы команды" : "Team plans", votes: 12 },
          { id: "results", text: russian ? "Результаты проекта" : "Project results", votes: 8 },
          { id: "feedback", text: russian ? "Обратная связь" : "Feedback", votes: 6 },
        ],
      },
    ],
  };
}
const meta = {
  title: "Widgets/WorkspaceMessagePoll",
  component: WorkspaceMessagePoll,
  parameters: { layout: "padded" },
  args: { poll: fixture(false, false) },
  render: function Render(args, context) {
    const { locale } = useTranslation();
    let initialPoll = fixture(
      locale === "ru",
      ["Results", "Closed", "Public Results", "Many Voters", "Read Only"].includes(context.name),
    );
    if (["Independent Questions", "Results"].includes(context.name))
      initialPoll = { ...initialPoll, anonymous: true };
    if (context.name === "Adding Options")
      initialPoll = { ...initialPoll, allowAddingOptions: true };
    if (context.name === "Single Choice")
      initialPoll = {
        ...initialPoll,
        multipleAnswers: false,
        questions: initialPoll.questions.map((q) => ({
          ...q,
          voterCount: q.options.reduce((sum, option) => sum + option.votes, 0),
        })),
      };
    if (context.name === "Public Results")
      initialPoll = {
        ...initialPoll,
        multipleAnswers: false,
        voterCount: 24,
        questions: initialPoll.questions.slice(0, 1),
      };
    if (context.name === "Many Voters")
      initialPoll = {
        ...initialPoll,
        voterCount: 80,
        questions: initialPoll.questions.slice(0, 1).map((question) => ({
          ...question,
          voterCount: 80,
          options: question.options.map((option) => ({ ...option, votes: 80 })),
        })),
      };
    if (context.name === "Default")
      initialPoll = {
        ...initialPoll,
        voterCount: 24,
        multipleAnswers: false,
        questions: initialPoll.questions.slice(0, 1),
      };
    if (context.name === "Closed") initialPoll = { ...initialPoll, closed: true };
    if (context.name === "Anonymous")
      initialPoll = { ...initialPoll, anonymous: true, resultsVisibility: "always" };
    if (context.name === "Read Only") initialPoll = { ...initialPoll, resultsVisibility: "always" };
    if (context.name === "Correct Answers")
      initialPoll = {
        ...initialPoll,
        questions: initialPoll.questions.map((q) => ({
          ...q,
          selectedOptionIds: [q.options[0]!.id],
          correctOptionIds: [q.options[0]!.id],
        })),
      };
    if (context.name === "Boundary")
      initialPoll = {
        ...initialPoll,
        voterCount: 0,
        questions: Array.from({ length: 20 }, (_, q) => ({
          id: `q${q}`,
          text: `${locale === "ru" ? "Вопрос" : "Question"} ${q + 1}`,
          voterCount: 0,
          selectedOptionIds: [],
          options: Array.from({ length: 20 }, (_, o) => ({
            id: `q${q}o${o}`,
            text: `${locale === "ru" ? "Вариант" : "Option"} ${o + 1}`,
            votes: 0,
          })),
        })),
      };
    initialPoll = {
      ...initialPoll,
      questions: initialPoll.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({
          ...option,
          previewVoters: Array.from({ length: Math.min(5, option.votes) }, (_, index) => ({
            id: `member-${index}`,
            avatarUrl:
              "data:image/svg+xml," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" fill="${["#805f86", "#517d83", "#a16b47", "#5f7092", "#787e50"][index]}"/><circle cx="14" cy="10" r="5" fill="#e7d9cc"/><ellipse cx="14" cy="27" rx="10" ry="11" fill="#e7d9cc"/></svg>`,
              ),
            name: (locale === "ru"
              ? ["Анна", "Борис", "Вера", "Глеб", "Дина"]
              : ["Alex", "Blake", "Casey", "Drew", "Ellis"])[index]!,
          })),
        })),
      })),
    };
    const [current, setCurrent] = useState<WorkspacePoll | null>(null);
    const [target, setTarget] = useState<PollVoterTarget | null>(null);
    const [limit, setLimit] = useState(20);
    const poll = current ?? initialPoll;
    const voterQuestions = visiblePollVoterQuestions(poll, args.readOnly ?? false);
    const option = voterQuestions
      .find((question) => question.id === target?.questionId)
      ?.options.find((item) => item.id === target?.optionId);
    const count = Math.min(option?.votes ?? 0, limit);
    return (
      <div
        className={`${context.name === "Public Results" ? "w-[360px] px-3 py-2" : "w-[440px] px-4 py-3"} max-w-full rounded-lg bg-msg-bg`}
      >
        <WorkspaceMessagePoll
          {...args}
          questionErrors={
            context.name === "Vote Error"
              ? {
                  schedule:
                    locale === "ru"
                      ? "Соединение потеряно. Повторите попытку."
                      : "Connection lost. Try again.",
                }
              : args.questionErrors
          }
          poll={poll}
          voterList={{
            questions: voterQuestions,
            target,
            onSelect: (next) => {
              setTarget(next);
              setLimit(20);
            },
            onLoadPage: () => setLimit((previous) => previous + 20),
            page: option && {
              items: Array.from({ length: count }, (_, index) => ({
                id: `synthetic-voter-${index}`,
                name: `${locale === "ru" ? "Участник команды" : "Team member"} ${index + 1}`,
              })),
              hasMore: count < option.votes,
            },
          }}
          onVote={(questionId, optionId, selected) => {
            const questions = poll.questions.map((q) => {
              if (q.id !== questionId) return q;
              let next = q.selectedOptionIds.filter((id) => id !== optionId);
              if (selected)
                next = poll.multipleAnswers ? [...q.selectedOptionIds, optionId] : [optionId];
              return {
                ...q,
                selectedOptionIds: next,
                voterCount:
                  q.voterCount + Number(next.length > 0) - Number(q.selectedOptionIds.length > 0),
                options: q.options.map((o) => ({
                  ...o,
                  votes: Math.max(
                    0,
                    o.votes +
                      Number(next.includes(o.id)) -
                      Number(q.selectedOptionIds.includes(o.id)),
                  ),
                })),
              };
            });
            setCurrent({
              ...poll,
              questions,
              voterCount:
                poll.voterCount +
                Number(questions.some((q) => q.selectedOptionIds.length > 0)) -
                Number(poll.questions.some((q) => q.selectedOptionIds.length > 0)),
            });
          }}
          onAddOption={async (questionId, text) =>
            await Promise.resolve(
              setCurrent({
                ...poll,
                questions: poll.questions.map((q) =>
                  q.id !== questionId
                    ? q
                    : {
                        ...q,
                        options: [...q.options, { id: crypto.randomUUID(), text, votes: 0 }],
                      },
                ),
              }),
            )
          }
        />
      </div>
    );
  },
} satisfies Meta<typeof WorkspaceMessagePoll>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const IndependentQuestions: Story = {};
export const Results: Story = {};
export const Closed: Story = {};
export const VoteError: Story = {};
export const Pending: Story = { args: { pendingQuestionIds: ["schedule"] } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Boundary: Story = {};

export const Anonymous: Story = {};
export const CorrectAnswers: Story = {};

export const PublicResults: Story = {};
export const ManyVoters: Story = {};
export const AddingOptions: Story = {};

export const SingleChoice: Story = {};
