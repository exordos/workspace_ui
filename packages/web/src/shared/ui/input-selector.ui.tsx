import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "./icon";
import {
  getOptionId,
  moveActiveOption,
  SELECT_FIELD_CLASS,
  SELECT_SIZE_CLASS,
  SelectListbox,
} from "./select-listbox.ui";
import type { InputSelectorProps } from "./select.types";
import type { KeyboardEvent } from "react";

export function InputSelector({
  value,
  onValueChange,
  options,
  searchable = false,
  invalid = false,
  emptyText,
  className = "",
  inputClassName = "",
  size = "default",
  disabled = false,
  readOnly = false,
  onKeyDown,
  onFocus,
  onBlur,
  id,
  ...inputProps
}: Readonly<InputSelectorProps>) {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${generatedId}-listbox`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const query = value.toLocaleLowerCase();
  const visibleOptions =
    searchable && query.length > 0
      ? options.filter((option) =>
          `${option.label} ${option.value} ${option.description ?? ""}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : options;
  const expanded = open && !disabled && !readOnly && visibleOptions.length > 0;
  const activeOption = visibleOptions.find(
    (option) => option.value === activeValue && !option.disabled,
  );
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (disabled || readOnly) close();
  }, [disabled, readOnly, close]);
  const choose = (nextValue: string) => {
    onValueChange(nextValue);
    setActiveValue(null);
    close();
    inputRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing || disabled || readOnly) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        setActiveValue(
          moveActiveOption(
            visibleOptions,
            expanded ? activeValue : null,
            event.key === "ArrowDown" ? 1 : -1,
          ),
        );
        setOpen(true);
        break;
      case "Enter":
        if (expanded && activeOption != null) {
          event.preventDefault();
          choose(activeOption.value);
        } else close();
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  };

  return (
    <>
      <div
        ref={anchorRef}
        className={`${SELECT_FIELD_CLASS} ${SELECT_SIZE_CLASS[size]} ${invalid ? "!border-danger" : ""} ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`.trim()}
      >
        <input
          {...inputProps}
          ref={inputRef}
          id={inputId}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          role="combobox"
          aria-autocomplete={searchable ? "list" : "none"}
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={
            expanded && activeOption != null ? getOptionId(listId, activeOption.value) : undefined
          }
          aria-invalid={invalid ? true : inputProps["aria-invalid"]}
          className={`h-full min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted focus-visible:!outline-none ${inputClassName}`.trim()}
          onChange={(event) => {
            onValueChange(event.target.value);
            setActiveValue(null);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            onFocus?.(event);
            setActiveValue(null);
            setOpen(true);
          }}
          onBlur={(event) => {
            onBlur?.(event);
            close();
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || readOnly}
          aria-label={t("selector.showOptions")}
          aria-controls={expanded ? listId : undefined}
          aria-expanded={expanded}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-card-bg-active hover:text-text-primary disabled:pointer-events-none"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            setActiveValue(null);
            setOpen(!expanded);
          }}
        >
          <Icon
            name="chevron-down"
            size={16}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {expanded ? (
        <SelectListbox
          id={listId}
          anchorRef={anchorRef}
          options={visibleOptions}
          value={value}
          activeValue={activeOption?.value ?? null}
          emptyText={emptyText}
          ariaLabel={inputProps["aria-label"] ?? t("selector.showOptions")}
          ariaLabelledBy={inputProps["aria-labelledby"]}
          onSelect={choose}
          onClose={close}
        />
      ) : null}
    </>
  );
}
