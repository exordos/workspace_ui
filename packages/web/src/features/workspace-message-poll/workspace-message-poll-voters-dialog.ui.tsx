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
  voterTarget: { questionId: string; optionId: string } | null;
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
    >
      <div className="space-y-3">
        <div className="space-y-1 text-sm">
          <label htmlFor={selectId}>{t("pollBubble.answer")}</label>
          <Select
            id={selectId}
            value={
              voterTarget ? JSON.stringify([voterTarget.questionId, voterTarget.optionId]) : ""
            }
            options={options}
            onValueChange={(value) => {
              const target = options.find((option) => option.value === value);
              if (target) onSelectOption(target.questionId, target.optionId);
            }}
          />
        </div>
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
