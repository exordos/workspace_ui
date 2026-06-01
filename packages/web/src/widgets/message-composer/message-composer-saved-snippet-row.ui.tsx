import React from "react";
import type { SavedSnippet } from "~/shared/api/zulip.types";

export const SavedSnippetRow = React.memo(function SavedSnippetRow({
  snippet,
  onSelect,
}: {
  snippet: SavedSnippet;
  onSelect: (snippet: SavedSnippet) => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-bg"
      onClick={() => onSelect(snippet)}
      aria-label={snippet.title}
      title={snippet.title}
    >
      <p className="truncate text-sm font-medium text-text-primary">{snippet.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{snippet.content}</p>
    </button>
  );
});
SavedSnippetRow.displayName = "SavedSnippetRow";
