import { countUnicodeCodePoints } from "./unicode-string.lib";

export const WORKSPACE_MESSAGE_MAX_LENGTH = 40_000;

export function isWorkspaceMessageWithinLimit(value: string): boolean {
  return countUnicodeCodePoints(value) <= WORKSPACE_MESSAGE_MAX_LENGTH;
}
