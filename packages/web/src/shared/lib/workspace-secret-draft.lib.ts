/** Editor-only fences. They must be replaced by encrypted URNs before transport. */
export const WORKSPACE_SECRET_DRAFT_OPEN = ":::secret\n";
export const WORKSPACE_SECRET_DRAFT_CLOSE = "\n:::";

export interface WorkspaceSecretDraftFragment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function hasWorkspaceSecretDraft(value: string): boolean {
  return value.includes(":::secret");
}

export function parseWorkspaceSecretDraft(value: string): readonly WorkspaceSecretDraftFragment[] {
  const fragments: WorkspaceSecretDraftFragment[] = [];
  let offset = 0;
  while (true) {
    const start = value.indexOf(":::secret", offset);
    if (start === -1) {
      if (fragments.length > 0 && value.slice(offset).includes(WORKSPACE_SECRET_DRAFT_CLOSE))
        throw new Error("invalid-secret");
      return fragments;
    }
    if (fragments.length > 0 && value.slice(offset, start).includes(WORKSPACE_SECRET_DRAFT_CLOSE))
      throw new Error("invalid-secret");
    if (!value.startsWith(WORKSPACE_SECRET_DRAFT_OPEN, start)) throw new Error("invalid-secret");
    const contentStart = start + WORKSPACE_SECRET_DRAFT_OPEN.length;
    const close = value.indexOf(WORKSPACE_SECRET_DRAFT_CLOSE, contentStart);
    if (close === -1) throw new Error("invalid-secret");
    const text = value.slice(contentStart, close);
    if (text.length === 0 || hasWorkspaceSecretDraft(text)) throw new Error("invalid-secret");
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
