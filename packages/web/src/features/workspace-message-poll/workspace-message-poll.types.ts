import type { ReactNode } from "react";

export interface WorkspacePollOption {
  id: string;
  text: string;
  votes: number;
  previewVoters?: readonly WorkspacePollVoter[];
}
export interface WorkspacePollQuestion {
  id: string;
  text: string;
  options: readonly WorkspacePollOption[];
  selectedOptionIds: readonly string[];
  correctOptionIds?: readonly string[];
  voterCount: number;
}
export interface WorkspacePoll {
  multipleAnswers: boolean;
  kind: "poll";
  id: string;
  questions: readonly WorkspacePollQuestion[];
  anonymous: boolean;
  allowRevote: boolean;
  allowAddingOptions: boolean;
  resultsVisibility: "always" | "after_vote";
  closed: boolean;
  closesAt?: string | null;
  closedAt?: string | null;
  voterCount: number;
}
export interface WorkspacePollVoter {
  id: string;
  name: string;
  avatarUrl?: string;
}
export interface WorkspacePollVoters {
  questionId: string;
  optionId: string;
  items: readonly WorkspacePollVoter[];
  loading?: boolean;
  error?: string;
  hasMore?: boolean;
}
export interface WorkspaceMessagePollProps {
  deadlineReached?: boolean;
  poll: WorkspacePoll;
  readOnly?: boolean;
  pendingQuestionIds?: readonly string[];
  questionErrors?: Readonly<Record<string, string | undefined>>;
  pending?: boolean;
  error?: string;
  voters?: WorkspacePollVoters;
  renderVoterAvatar?: (voter: WorkspacePollVoter) => ReactNode;
  onVote?: (questionId: string, optionId: string, selected: boolean) => void;
  onAddOption?: (questionId: string, text: string) => Promise<void>;
  onLoadVoters?: (questionId: string, optionId: string, more: boolean) => void;
  maxOptions?: number;
}
