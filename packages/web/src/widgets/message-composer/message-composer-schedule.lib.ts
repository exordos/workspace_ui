import type { ScheduledComposerMessage } from "./message-composer.types";

interface BuildScheduledComposerMessageOptions {
  id: string;
  content: string;
  subject: string;
  value: string;
  files: File[];
  canSendWithEmptyActiveValue: boolean;
  sendAt: number;
}

export function buildScheduledComposerMessage({
  id,
  content,
  subject,
  value,
  files,
  canSendWithEmptyActiveValue,
  sendAt,
}: BuildScheduledComposerMessageOptions): ScheduledComposerMessage | null {
  const hasText = value.trim().length > 0;
  const hasFiles = files.length > 0;
  if (!hasText && !hasFiles && !canSendWithEmptyActiveValue) return null;

  return {
    id,
    content,
    subject,
    files: hasFiles ? [...files] : [],
    sendAt,
  };
}
