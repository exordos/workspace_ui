import { useState } from "react";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  CreatePollDialog,
  type PollDraft,
} from "~/features/workspace-message-poll/create-poll-dialog.ui";
import type {
  WorkspacePoll,
  WorkspacePollVoters,
} from "~/features/workspace-message-poll/workspace-message-poll.types";
import { WorkspaceMessagePoll } from "~/features/workspace-message-poll/workspace-message-poll.ui";
import {
  PollCloseDialog,
  PollSettingsDialog,
} from "~/features/workspace-message-poll/workspace-poll-management-dialogs.ui";
import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { MessageComposer } from "~/widgets/message-composer/message-composer.ui";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const author = "preview-author";
const message: MessengerMessage = {
  uuid: "preview-poll-message",
  conversationId: "topic:preview-stream:preview-topic",
  projectId: "preview-project",
  streamUuid: "preview-stream",
  topicUuid: "preview-topic",
  authorUuid: author,
  userUuid: author,
  payload: { kind: "markdown", content: "" },
  read: true,
  pinned: false,
  starred: false,
  isOwn: true,
  reactions: {},
  reactionUserUuidsByEmojiName: {},
  ownReactionUuidsByEmojiName: {},
  createdAt: "2026-10-20T09:00:00Z",
  updatedAt: "2026-10-20T09:00:00Z",
};

function fromDraft(draft: PollDraft): WorkspacePoll {
  return {
    kind: "poll",
    id: crypto.randomUUID(),
    questions: draft.questions.map((question) => {
      const options = question.options.map((option) => ({
        id: crypto.randomUUID(),
        text: option.text,
        votes: 0,
        correct: option.correct,
      }));
      return {
        id: crypto.randomUUID(),
        text: question.text,
        options: options.map(({ id, text, votes }) => ({ id, text, votes })),
        correctOptionIds: options.filter((option) => option.correct).map((option) => option.id),
        selectedOptionIds: [],
        voterCount: 0,
      };
    }),
    multipleAnswers: draft.multipleAnswers,
    anonymous: draft.anonymous,
    allowRevote: draft.allowRevote,
    allowAddingOptions: draft.allowAddingOptions,
    resultsVisibility: draft.resultsVisibility === "always" ? "always" : "after_vote",
    closesAt: draft.closesAt,
    closed: false,
    voterCount: 0,
  };
}

function applyVote(
  current: WorkspacePoll | null,
  questionId: string,
  optionId: string,
  selected: boolean,
): WorkspacePoll | null {
  if (!current) return current;
  const questions = current.questions.map((question) => {
    if (question.id !== questionId) return question;
    const selectedOptionIds = selected
      ? [...(current.multipleAnswers ? question.selectedOptionIds : []), optionId]
      : question.selectedOptionIds.filter((id) => id !== optionId);
    return {
      ...question,
      selectedOptionIds,
      voterCount: selectedOptionIds.length > 0 ? 1 : 0,
      options: question.options.map((option) => ({
        ...option,
        votes: selectedOptionIds.includes(option.id) ? 1 : 0,
      })),
    };
  });
  return {
    ...current,
    questions,
    voterCount: questions.some((question) => question.selectedOptionIds.length > 0) ? 1 : 0,
  };
}

type PreviewItem =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "poll"; poll: WorkspacePoll };

function PollRow({ initialPoll }: Readonly<{ initialPoll: WorkspacePoll }>) {
  const [poll, setPoll] = useState(initialPoll);
  const [voters, setVoters] = useState<WorkspacePollVoters>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const updatePoll = (update: (current: WorkspacePoll) => WorkspacePoll) => {
    setPoll((current) =>
      current.closed || (current.closesAt != null && Date.parse(current.closesAt) <= Date.now())
        ? current
        : update(current),
    );
  };
  return (
    <>
      <WorkspaceMessageBubblePresentation
        message={{
          kind: "server",
          key: poll.id,
          message: {
            ...message,
            uuid: poll.id,
            payload: {
              kind: "poll",
              questions: [],
              multipleAnswers: poll.multipleAnswers,
              isAnonymous: poll.anonymous,
              allowRevote: poll.allowRevote,
              resultsVisibility: poll.resultsVisibility,
              allowAddingOptions: poll.allowAddingOptions,
              closesAt: poll.closesAt ?? null,
              closedAt: null,
            },
          },
          createdAt: message.createdAt,
          authorUuid: author,
          isOwn: true,
          read: true,
        }}
        currentUserUuid={author}
        isFirstInGroup
        isLastInGroup
        usersById={{}}
        passiveLoadersEnabled={false}
        pollBody
        onPollSettings={!poll.closed ? () => setSettingsOpen(true) : undefined}
        onPollClose={!poll.closed ? () => setCloseOpen(true) : undefined}
        bodyOverride={
          <WorkspaceMessagePoll
            poll={poll}
            voters={voters}
            onVote={(questionId, optionId, selected) =>
              updatePoll((current) => applyVote(current, questionId, optionId, selected) ?? current)
            }
            onAddOption={(questionId, text) => {
              const id = crypto.randomUUID();
              updatePoll((current) => ({
                ...current,
                questions: current.questions.map((question) =>
                  question.id === questionId
                    ? { ...question, options: [...question.options, { id, text, votes: 0 }] }
                    : question,
                ),
              }));
              return Promise.resolve();
            }}
            onLoadVoters={(questionId, optionId) =>
              setVoters({
                questionId,
                optionId,
                items: poll.questions.some(
                  (question) =>
                    question.id === questionId && question.selectedOptionIds.includes(optionId),
                )
                  ? [{ id: author, name: "Alex" }]
                  : [],
              })
            }
          />
        }
      />
      {/* Dialogs are supplied by the reusable poll controls. */}
      <PollSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        closesAt={poll.closesAt ?? null}
        question={poll.questions[0]?.text ?? ""}
        allowAddingOptions={poll.allowAddingOptions}
        onSave={(settings) => updatePoll((current) => ({ ...current, ...settings }))}
      />
      <PollCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onClose={() => updatePoll((current) => ({ ...current, closed: true }))}
      />
    </>
  );
}

function PollFlow() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  return (
    <div className="bg-bg-primary mx-auto flex min-h-[620px] max-w-3xl flex-col p-4">
      <div className="flex-1">
        {items.map((item) =>
          item.kind === "poll" ? (
            <PollRow key={item.id} initialPoll={item.poll} />
          ) : (
            <WorkspaceMessageBubblePresentation
              key={item.id}
              message={{
                kind: "server",
                key: item.id,
                message: {
                  ...message,
                  uuid: item.id,
                  payload: { kind: "markdown", content: item.text },
                },
                createdAt: message.createdAt,
                authorUuid: author,
                isOwn: true,
                read: true,
              }}
              currentUserUuid={author}
              isFirstInGroup
              isLastInGroup
              usersById={{}}
              passiveLoadersEnabled={false}
              bodyMarkdown={item.text}
            />
          ),
        )}
      </div>
      <div className="mb-2">
        <Button variant="neutral" onClick={() => setOpen(true)}>
          {t("pollForm.title")}
        </Button>
      </div>
      <MessageComposer
        initialValue=""
        onSend={(text) => {
          const id = crypto.randomUUID();
          setItems((previous) => [...previous, { id, kind: "text", text }]);
        }}
      />
      <CreatePollDialog
        open={open}
        onOpenChange={setOpen}
        onCreate={(draft) => {
          const poll = fromDraft(draft);
          setItems((previous) => [...previous, { id: poll.id, kind: "poll", poll }]);
          setOpen(false);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Widgets/WorkspaceMessageList/PollFlow",
  component: PollFlow,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PollFlow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
