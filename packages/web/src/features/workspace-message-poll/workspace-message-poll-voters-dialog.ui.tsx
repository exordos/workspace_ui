import React, { useId } from "react";
import { useTranslation } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { Select } from "~/shared/ui/select";
import type {
  WorkspaceMessagePollProps,
  WorkspacePollVoters,
  WorkspacePoll,
} from "./workspace-message-poll.types";
interface Props {
  poll: WorkspacePoll;
  onSelectOption: (questionId: string, optionId: string) => void;
  enabled: boolean;
  voterTarget: {
    questionId: string;
    optionId: string;
    mode: "option" | "overview";
  } | null;
  activeVoters?: WorkspacePollVoters;
  onDismiss: () => void;
  onLoadVoters: WorkspaceMessagePollProps["onLoadVoters"];
}
export function PollVotersDialog({
  enabled,
  poll,
  onSelectOption,
  voterTarget,
  activeVoters,
  onDismiss,
  onLoadVoters,
}: Readonly<Props>): React.ReactElement {
  const { t } = useTranslation();
  const selectId = useId();
  const question = poll.questions.find((question) => question.id === voterTarget?.questionId);
  const option = question?.options.find((option) => option.id === voterTarget?.optionId);
  const options = poll.questions.flatMap((question) =>
    question.options.map((option) => ({
      value: JSON.stringify([question.id, option.id]),
      label: option.text,
      group: { id: question.id, label: question.text },
      questionId: question.id,
      optionId: option.id,
    })),
  );
  let status: React.ReactNode = null;
  if (activeVoters?.loading) status = <p role="status">{t("pollBubble.loading")}</p>;
  else if (activeVoters?.error)
    status = (
      <p role="alert" className="text-danger">
        {activeVoters.error}
      </p>
    );
  else if (activeVoters?.items.length === 0)
    status = <p className="text-text-secondary">{t("pollBubble.noVoters")}</p>;
  return (
    <AppDialog
      open={voterTarget !== null && enabled}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title={t("pollBubble.voters")}
      scrollBody
      positionClassName="top-1/2 -translate-y-1/2"
    >
      <div className="space-y-3">
        {poll.questions.length > 1 && (
          <p className="break-words text-sm text-text-secondary">{question?.text}</p>
        )}
        {voterTarget?.mode === "overview" ? (
          <Select
            id={selectId}
            size="compact"
            aria-label={t("pollBubble.answer")}
            value={
              voterTarget ? JSON.stringify([voterTarget.questionId, voterTarget.optionId]) : ""
            }
            options={options}
            onValueChange={(value) => {
              const target = options.find((option) => option.value === value);
              if (target) onSelectOption(target.questionId, target.optionId);
            }}
          />
        ) : (
          <p className="break-words text-sm">{option?.text}</p>
        )}
        {option && (
          <p className="text-xs text-text-secondary">
            {t("pollBubble.participantCount", { count: option.votes })}
          </p>
        )}
        {activeVoters?.items.map((voter) => (
          <div key={voter.id} className="flex items-center gap-3">
            <Avatar size="sm" src={voter.avatarUrl}>
              {voter.name.slice(0, 1)}
            </Avatar>
            <span className="break-words text-sm">{voter.name}</span>
          </div>
        ))}
        {status}
        {activeVoters &&
          (Boolean(activeVoters.hasMore) || Boolean(activeVoters.error)) &&
          voterTarget && (
            <Button
              disabled={activeVoters.loading}
              appearance="ghost"
              onClick={() =>
                onLoadVoters?.(voterTarget.questionId, voterTarget.optionId, !activeVoters.error)
              }
            >
              {t(activeVoters.error ? "pollBubble.retry" : "pollBubble.loadMore")}
            </Button>
          )}
      </div>
    </AppDialog>
  );
}
