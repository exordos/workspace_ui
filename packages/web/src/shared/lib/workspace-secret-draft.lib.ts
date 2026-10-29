/** Editor-only fences. They must be replaced by encrypted URNs before transport. */
export const WORKSPACE_SECRET_DRAFT_OPEN = ":::";
export const WORKSPACE_SECRET_DRAFT_CLOSE = ":::";

export interface WorkspaceSecretDraftFragment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function hasWorkspaceSecretDraft(value: string): boolean {
  return value.includes(WORKSPACE_SECRET_DRAFT_OPEN);
}

export function parseWorkspaceSecretDraft(value: string): readonly WorkspaceSecretDraftFragment[] {
  const fragments: WorkspaceSecretDraftFragment[] = [];
  let offset = 0;
  while (true) {
    const start = value.indexOf(WORKSPACE_SECRET_DRAFT_OPEN, offset);
    if (start === -1) return fragments;
    const contentStart = start + WORKSPACE_SECRET_DRAFT_OPEN.length;
    const close = value.indexOf(WORKSPACE_SECRET_DRAFT_CLOSE, contentStart);
    if (close === -1) throw new Error("invalid-secret");
    const text = value.slice(contentStart, close);
    if (text.trim().length === 0) throw new Error("invalid-secret");
    const end = close + WORKSPACE_SECRET_DRAFT_CLOSE.length;
    fragments.push({ start, end, text });
    offset = end;
  }
}

export function replaceWorkspaceSecretDraft(
  value: string,
  fragments: readonly WorkspaceSecretDraftFragment[],
  replacements: readonly string[],
): string {
  if (fragments.length !== replacements.length) throw new Error("invalid-secret");
  let result = "";
  let offset = 0;
  fragments.forEach((fragment, index) => {
    result += value.slice(offset, fragment.start) + replacements[index];
    offset = fragment.end;
  });
  return result + value.slice(offset);
}
