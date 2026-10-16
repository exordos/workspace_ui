import type { ReactNode } from "react";

export interface SearchableCheckboxOption<TValue extends string | number> {
  value: TValue;
  label: ReactNode;
  searchText: string;
  disabled?: boolean;
}

export interface SearchableCheckboxListProps<TValue extends string | number> {
  options: readonly SearchableCheckboxOption<TValue>[];
  selectedValues: ReadonlySet<TValue>;
  onToggle: (value: TValue) => void;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder: string;
  emptyLabel: string;
  inputClassName: string;
  listClassName: string;
  className?: string;
  rowClassName?: string;
}

export function SearchableCheckboxList<TValue extends string | number>({
  options,
  selectedValues,
  onToggle,
  query,
  onQueryChange,
  queryPlaceholder,
  emptyLabel,
  inputClassName,
  listClassName,
  className = "flex flex-1 flex-col gap-3 overflow-hidden",
  rowClassName = "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg",
}: Readonly<SearchableCheckboxListProps<TValue>>) {
  const normalizedQuery = query.trim().toLowerCase();
  // Filtering affects visibility only. The caller owns the complete selection.
  const visibleOptions = options.filter((option) =>
    option.searchText.toLowerCase().includes(normalizedQuery),
  );

  return (
    <div className={className}>
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className={inputClassName}
        placeholder={queryPlaceholder}
        aria-label={queryPlaceholder}
      />
      <div className={listClassName}>
        {visibleOptions.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-text-muted">{emptyLabel}</p>
        ) : (
          visibleOptions.map((option) => (
            <label key={option.value} className={rowClassName}>
              <input
                type="checkbox"
                checked={selectedValues.has(option.value)}
                onChange={() => onToggle(option.value)}
                className="h-4 w-4 rounded border-border-subtle"
                disabled={option.disabled}
              />
              {option.label}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
