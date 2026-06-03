/**
 * Pure markdown list continuation/exit on Enter in the composer textarea (no DOM/state).
 */
interface ListContinuationInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface ListContinuationResult {
  nextValue: string;
  nextSelection: number;
}

const UNORDERED_LIST_RE = /^(\s*)([-*+])\s(.*)$/;
const ORDERED_LIST_RE = /^(\s*)(\d+)\.\s(.*)$/;

function isCursorAtLineEnd(
  text: string,
  cursor: number,
): { lineStart: number; lineEnd: number } | null {
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const nextNewline = text.indexOf("\n", cursor);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  if (cursor !== lineEnd) {
    return null;
  }
  return { lineStart, lineEnd };
}

function replaceLineWithEmpty(
  text: string,
  lineStart: number,
  lineEnd: number,
): ListContinuationResult {
  const nextValue = text.slice(0, lineStart) + text.slice(lineEnd);
  return { nextValue, nextSelection: lineStart };
}

export function applyListContinuationOnNewline(
  input: ListContinuationInput,
): ListContinuationResult | null {
  const { text, selectionStart, selectionEnd } = input;
  if (selectionStart !== selectionEnd) {
    return null;
  }

  const lineBounds = isCursorAtLineEnd(text, selectionStart);
  if (lineBounds == null) {
    return null;
  }

  const { lineStart, lineEnd } = lineBounds;
  const line = text.slice(lineStart, lineEnd);

  const unorderedMatch = UNORDERED_LIST_RE.exec(line);
  if (unorderedMatch != null) {
    const indent = unorderedMatch[1] ?? "";
    const marker = unorderedMatch[2] ?? "-";
    const content = unorderedMatch[3] ?? "";
    if (content.trim().length === 0) {
      return replaceLineWithEmpty(text, lineStart, lineEnd);
    }

    const insertion = `\n${indent}${marker} `;
    const nextValue = text.slice(0, selectionStart) + insertion + text.slice(selectionEnd);
    return { nextValue, nextSelection: selectionStart + insertion.length };
  }

  const orderedMatch = ORDERED_LIST_RE.exec(line);
  if (orderedMatch != null) {
    const indent = orderedMatch[1] ?? "";
    const currentRaw = orderedMatch[2] ?? "1";
    const content = orderedMatch[3] ?? "";
    if (content.trim().length === 0) {
      return replaceLineWithEmpty(text, lineStart, lineEnd);
    }

    const nextMarker = Number(currentRaw) + 1;
    const insertion = `\n${indent}${nextMarker}. `;
    const nextValue = text.slice(0, selectionStart) + insertion + text.slice(selectionEnd);
    return { nextValue, nextSelection: selectionStart + insertion.length };
  }

  return null;
}
