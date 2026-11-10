import { useState } from "react";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type {
  WorkspacePoll,
  WorkspacePollVoter,
  WorkspacePollVoters,
} from "~/features/workspace-message-poll/workspace-message-poll.types";
import { WorkspaceMessagePoll } from "~/features/workspace-message-poll/workspace-message-poll.ui";
import { useTranslation } from "~/i18n/i18n";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

type ReferenceVariant = "active" | "correct" | "incorrect" | "closed";
const author = "reference-author";
const createdAt = "2026-11-10T15:40:00+03:00";
const closesAt = "2026-11-12T18:00:00+03:00";

function voterFixture(index: number, russian: boolean): WorkspacePollVoter {
  const color = ["#805f86", "#517d83", "#a16b47", "#5f7092", "#787e50"][index];
  return {
    id: `reference-voter-${index}`,
    name: (russian
      ? ["Анна", "Борис", "Вера", "Глеб", "Дина"]
      : ["Alex", "Blake", "Casey", "Drew", "Ellis"])[index]!,
    avatarUrl:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" fill="${color}"/><circle cx="14" cy="10" r="5" fill="#e7d9cc"/><ellipse cx="14" cy="27" rx="10" ry="11" fill="#e7d9cc"/></svg>`,
      ),
  };
}

function pollFixture(variant: ReferenceVariant, russian: boolean): WorkspacePoll {
  const correct = variant === "correct" || variant === "incorrect";
  const votes = correct ? [4, 12, 4] : [6, 16, 2];
  const content = russian
    ? {
        channels: ["Общий чат", "Поддержка", "Объявления"],
        schedule: ["Вторник, 11:00", "Среда, 14:00", "Четверг, 16:00"],
        channelQuestion: "Какой канал для срочных вопросов?",
        scheduleQuestion: "Когда проведём встречу команды?",
      }
    : {
        channels: ["General chat", "Support", "Announcements"],
        schedule: ["Tuesday, 11:00", "Wednesday, 14:00", "Thursday, 16:00"],
        channelQuestion: "Which channel is for urgent questions?",
        scheduleQuestion: "When should we meet as a team?",
      };
  const labels = correct ? content.channels : content.schedule;
  return {
    kind: "poll",
    id: `reference-${variant}`,
    multipleAnswers: false,
    anonymous: false,
    allowRevote: true,
    allowAddingOptions: false,
    resultsVisibility: "after_vote",
    closed: variant === "closed",
    closesAt: correct ? null : closesAt,
    closedAt: variant === "closed" ? closesAt : null,
    voterCount: correct ? 20 : 24,
    questions: [
      {
        id: "reference-question",
        text: correct ? content.channelQuestion : content.scheduleQuestion,
        voterCount: correct ? 20 : 24,
        selectedOptionIds: [variant === "incorrect" ? "option-0" : "option-1"],
        correctOptionIds: correct ? ["option-1"] : undefined,
        options: labels.map((text, index) => ({
          id: `option-${index}`,
          text,
          votes: votes[index]!,
          recentVoters: Array.from({ length: Math.min(5, votes[index]!) }, (_, voterIndex) =>
            voterFixture(voterIndex, russian),
          ),
        })),
      },
    ],
  };
}

function applyVote(
  poll: WorkspacePoll,
  questionId: string,
  optionId: string,
  selected: boolean,
): WorkspacePoll {
  const currentQuestion = poll.questions.find((question) => question.id === questionId);
  if (!currentQuestion) return poll;
  const selectedOptionIds = selected ? [optionId] : [];
  const change =
    Number(selectedOptionIds.length > 0) - Number(currentQuestion.selectedOptionIds.length > 0);
  return {
    ...poll,
    voterCount: poll.voterCount + change,
    questions: poll.questions.map((question) =>
      question.id !== questionId
        ? question
        : {
            ...question,
            selectedOptionIds,
            voterCount: question.voterCount + change,
            options: question.options.map((option) => ({
              ...option,
              votes:
                option.votes +
                Number(selectedOptionIds.includes(option.id)) -
                Number(question.selectedOptionIds.includes(option.id)),
            })),
          },
    ),
  };
}

function ReferenceBubble({
  variant,
  russian,
}: Readonly<{ variant: ReferenceVariant; russian: boolean }>) {
  const [poll, setPoll] = useState(() => pollFixture(variant, russian));
  const [voters, setVoters] = useState<WorkspacePollVoters>();
  const message: MessengerMessage = {
    uuid: poll.id,
    conversationId: "topic:reference-stream:reference-topic",
    projectId: "reference-project",
    streamUuid: "reference-stream",
    topicUuid: "reference-topic",
    authorUuid: author,
    userUuid: "reference-current-user",
    payload: {
      kind: "poll",
      questions: [],
      multipleAnswers: poll.multipleAnswers,
      isAnonymous: poll.anonymous,
      allowRevote: poll.allowRevote,
      resultsVisibility: poll.resultsVisibility,
      allowAddingOptions: poll.allowAddingOptions,
      closesAt: poll.closesAt ?? null,
      closedAt: poll.closedAt ?? null,
    },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt,
    updatedAt: createdAt,
  };
  return (
    <div className="w-[410px] max-w-full shrink-0">
      <WorkspaceMessageBubblePresentation
        message={{
          kind: "server",
          key: message.uuid,
          message,
          createdAt,
          authorUuid: author,
          isOwn: false,
          read: true,
        }}
        currentUserUuid="reference-current-user"
        isFirstInGroup
        isLastInGroup
        resolveAuthorLabel={() => (russian ? "Алексей" : "Alex")}
        topicLabel={russian ? "Общий" : "General"}
        usersById={{}}
        passiveLoadersEnabled={false}
        pollBody
        bodyOverride={
          <WorkspaceMessagePoll
            poll={poll}
            voters={voters}
            deadlineReached={false}
            onVote={(questionId, optionId, selected) =>
              setPoll((previous) => applyVote(previous, questionId, optionId, selected))
            }
            onLoadVoters={(questionId, optionId) =>
              setVoters({
                questionId,
                optionId,
                items:
                  poll.questions
                    .find((question) => question.id === questionId)
                    ?.options.find((option) => option.id === optionId)?.recentVoters ?? [],
              })
            }
          />
        }
      />
    </div>
  );
}

function ReferenceExample({ variant }: Readonly<{ variant?: ReferenceVariant }>) {
  const { locale } = useTranslation();
  const variants: ReferenceVariant[] = variant ? [variant] : ["active", "correct", "closed"];
  return (
    <div className="flex items-start gap-6">
      {variants.map((item) => (
        <ReferenceBubble key={`${locale}:${item}`} variant={item} russian={locale === "ru"} />
      ))}
    </div>
  );
}

const meta = {
  title: "Widgets/WorkspaceMessagePoll/Reference bubbles",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = { render: () => <ReferenceExample variant="active" /> };
export const CorrectAnswer: Story = { render: () => <ReferenceExample variant="correct" /> };
export const Closed: Story = { render: () => <ReferenceExample variant="closed" /> };
export const AllStates: Story = { render: () => <ReferenceExample /> };

export const IncorrectAnswer: Story = { render: () => <ReferenceExample variant="incorrect" /> };
