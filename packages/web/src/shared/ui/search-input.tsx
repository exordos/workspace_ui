import React, { useCallback, useMemo, useRef } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "./icon";
import "./search-input.css";
import type { SearchInputProps } from "./search-input.types";

const SIZE_CONTAINER_CLASS: Record<"sm" | "md", string> = {
  sm: "h-8 gap-2 px-2 py-0.5",
  md: "h-10 gap-2 px-3 py-2",
};

const SIZE_INPUT_CLASS: Record<"sm" | "md", string> = {
  sm: "h-full text-sm",
  md: "h-full text-base",
};

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref != null) {
    ref.current = value;
  }
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      placeholder,
      ariaLabel,
      type = "search",
      clearable = true,
      onClear,
      iconPosition = "right",
      size = "sm",
      className = "",
      inputClassName = "",
      disabled = false,
      onKeyDown,
    },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const hasValue = value.length > 0;
    const showClear = clearable && hasValue && !disabled;

    const handleInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
      },
      [onChange],
    );

    const handleClearMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    }, []);

    const handleClear = useCallback(() => {
      onChange("");
      onClear?.();
      inputRef.current?.focus();
    }, [onChange, onClear]);

    const iconElement = useMemo(
      // 18px: новый search.svg заполняет viewBox целиком — в поле ввода 20 выглядел крупновато
      () => <Icon name="search" size={18} className="search-input-icon" />,
      [],
    );

    return (
      <label
        className={`search-input flex min-w-0 items-center rounded-lg border border-border-subtle bg-text-field-bg text-text-muted opacity-100 focus-within:border-accent focus-within:text-text-primary ${SIZE_CONTAINER_CLASS[size]} ${className}`.trim()}
      >
        {iconPosition === "left" ? iconElement : null}
        <input
          ref={handleInputRef}
          type={type}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          className={`search-input-field min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted focus-visible:!outline-none ${SIZE_INPUT_CLASS[size]} ${inputClassName}`.trim()}
        />
        {showClear && iconPosition === "right" ? (
          <button
            type="button"
            onMouseDown={handleClearMouseDown}
            onClick={handleClear}
            aria-label={t("search.clear")}
            className="search-input-clear inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
        {iconPosition === "right" ? iconElement : null}
        {showClear && iconPosition !== "right" ? (
          <button
            type="button"
            onMouseDown={handleClearMouseDown}
            onClick={handleClear}
            aria-label={t("search.clear")}
            className="search-input-clear inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </label>
    );
  },
);
