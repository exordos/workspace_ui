import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import "./inline-text-field.css";

export type InlineTextFieldProps = Omit<
  ComponentPropsWithoutRef<"textarea">,
  "children" | "defaultValue" | "rows" | "value"
> & {
  value: string;
  leading?: ReactNode;
};

function resizeToContent(control: HTMLTextAreaElement) {
  control.style.height = "0px";
  control.style.height = `${control.scrollHeight}px`;
}

/** A borderless, growing text control. Labels and submission belong to the caller. */
export const InlineTextField = forwardRef<HTMLTextAreaElement, InlineTextFieldProps>(
  function InlineTextField({ value, leading, className = "", disabled, ...props }, ref) {
    const controlRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => controlRef.current!, []);

    useLayoutEffect(() => {
      if (controlRef.current) resizeToContent(controlRef.current);
    }, [value]);

    useLayoutEffect(() => {
      const control = controlRef.current;
      if (!control) return;
      const resize = () => resizeToContent(control);
      let previousWidth = control.getBoundingClientRect().width;
      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(([entry]) => {
              if (!entry || entry.contentRect.width === previousWidth) return;
              previousWidth = entry.contentRect.width;
              resize();
            });
      observer?.observe(control);
      // Font metrics can change while the field keeps the same width.
      window.addEventListener("resize", resize);
      document.fonts?.addEventListener("loadingdone", resize);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", resize);
        document.fonts?.removeEventListener("loadingdone", resize);
      };
    }, []);

    return (
      <div
        className={`inline-text-field ${className}`.trim()}
        data-disabled={disabled ? true : undefined}
      >
        {leading != null && (
          <span className="inline-text-field-leading" aria-hidden="true">
            {leading}
          </span>
        )}
        <textarea
          {...props}
          ref={controlRef}
          rows={1}
          value={value}
          disabled={disabled}
          className="inline-text-field-control"
        />
      </div>
    );
  },
);
