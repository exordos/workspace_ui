import React from "react";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  children,
  error,
  className = "",
}) => (
  <div className={`mb-1.5 block min-w-0 ${className}`.trim()}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text-primary">
      {label}
    </label>
    {children}
    {error != null && error.length > 0 ? (
      <span className="mt-1 block text-xs text-text-muted" role="alert">
        {error}
      </span>
    ) : null}
  </div>
);
