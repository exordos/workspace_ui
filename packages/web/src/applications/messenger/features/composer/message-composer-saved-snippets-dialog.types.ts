import type { SavedSnippet } from "./message-composer-saved-snippets.types";
import type { CSSProperties } from "react";

export interface MessageComposerSavedSnippetsDialogProps {
  dialogStyle: CSSProperties;
  createMode: boolean;
  savedSnippetTitle: string;
  savedSnippetContent: string;
  savedSnippetsFilter: string;
  savedSnippetsLoading: boolean;
  savedSnippetsError: string | null;
  filteredSnippets: SavedSnippet[];
  canSaveSnippet: boolean;
  onCloseBackdrop: () => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onCancelCreate: () => void;
  onSubmitCreate: () => void;
  onSelectSnippet: (snippet: SavedSnippet) => void;
  onStartCreate: () => void;
}
