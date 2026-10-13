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
import type { SelectProps } from "./select.types";
import type { KeyboardEvent } from "react";

export function Select({
  value,
  onValueChange,
  options,
  id,
  name,
  disabled = false,
  required,
  invalid = false,
  placeholder,
  emptyText,
  className = "",
  size = "default",
  ...ariaProps
}: Readonly<SelectProps>) {
  const { t } = useTranslation();
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeaheadRef = useRef({ text: "", updatedAt: 0 });
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [validationFailed, setValidationFailed] = useState(false);
  const selected = options.find((option) => option.value === value);
  const showValidationError =
    validationFailed &&
    required &&
    (selected == null || selected.value === "" || selected.disabled);
  const expanded = open && !disabled;
  const activeOption = options.find((option) => option.value === activeValue && !option.disabled);
  const close = useCallback(() => {
    setOpen(false);
    typeaheadRef.current = { text: "", updatedAt: 0 };
  }, []);
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  const choose = (nextValue: string) => {
    onValueChange(nextValue);
    setValidationFailed(false);
    close();
    triggerRef.current?.focus();
  };
  const show = (direction: 1 | -1 = 1) => {
    setActiveValue(
      selected != null && !selected.disabled
        ? selected.value
        : moveActiveOption(options, null, direction),
    );
    setOpen(true);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        if (expanded) setActiveValue(moveActiveOption(options, activeValue, direction));
        else show(direction);
        break;
      }
      case "Home":
      case "End":
        if (!expanded) return;
        event.preventDefault();
        setActiveValue(moveActiveOption(options, null, event.key === "Home" ? 1 : -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!expanded) show();
        else if (activeOption != null) choose(activeOption.value);
        break;
      case "Escape":
        if (!expanded) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const now = event.timeStamp;
          const previous = typeaheadRef.current;
          const text =
            (now - previous.updatedAt < 700 ? previous.text : "") + event.key.toLocaleLowerCase();
          typeaheadRef.current = { text, updatedAt: now };
          const query = [...text].every((character) => character === text[0])
            ? event.key.toLocaleLowerCase()
            : text;
          const currentIndex = options.findIndex(
            (option) => option.value === (activeValue ?? value),
          );
          const ordered = [
            ...options.slice(currentIndex + 1),
            ...options.slice(0, currentIndex + 1),
          ];
          const match = ordered.find(
            (option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(query),
          );
          if (match != null) {
            event.preventDefault();
            setActiveValue(match.value);
            if (!expanded) setOpen(true);
          }
        }
    }
  };

  return (
    <>
      <button
        {...ariaProps}
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={expanded ? listId : undefined}
        aria-expanded={expanded}
        aria-activedescendant={
          expanded && activeOption != null ? getOptionId(listId, activeOption.value) : undefined
        }
        aria-required={required}
        aria-invalid={invalid || showValidationError ? true : ariaProps["aria-invalid"]}
        disabled={disabled}
        data-icon-hover="custom"
        className={`${SELECT_FIELD_CLASS} ${SELECT_SIZE_CLASS[size]} text-left focus-visible:outline-none ${invalid || showValidationError ? "!border-danger" : ""} ${className}`.trim()}
        onClick={() => {
          if (expanded) close();
          else show();
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
      >
        <span className={`min-w-0 flex-1 truncate ${selected == null ? "text-text-muted" : ""}`}>
          {selected?.label ?? placeholder ?? t("selector.placeholder")}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={`shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <select
        name={name}
        value={selected?.value ?? ""}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => choose(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          setValidationFailed(true);
          triggerRef.current?.focus();
        }}
      >
        {!options.some((option) => option.value === "") ? <option value="" disabled /> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {expanded ? (
        <SelectListbox
          id={listId}
          anchorRef={triggerRef}
          options={options}
          value={value}
          activeValue={activeOption?.value ?? null}
          emptyText={emptyText}
          ariaLabel={ariaProps["aria-label"]}
          ariaLabelledBy={ariaProps["aria-labelledby"] ?? triggerId}
          onActiveChange={setActiveValue}
          onSelect={choose}
          onClose={close}
        />
      ) : null}
    </>
  );
}
