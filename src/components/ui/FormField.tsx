import React from "react";
import { FieldError } from "react-hook-form";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  name?: string;
  error?: string | FieldError;
  helperText?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      name,
      error,
      helperText,
      required = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const errorMessage =
      typeof error === "string" ? error : error?.message?.toString();

    return (
      <div ref={ref} className={`flex flex-col gap-1.5 w-full ${className}`} {...props}>
        {label && (
          <label
            htmlFor={name}
            className="text-form-label text-gray-700 select-none flex items-center gap-1"
          >
            <span>{label}</span>
            {required && <span className="text-danger font-bold">*</span>}
          </label>
        )}
        {children}
        {errorMessage ? (
          <p className="text-form-helper text-danger font-medium">{errorMessage}</p>
        ) : helperText ? (
          <p className="text-form-helper text-muted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
FormField.displayName = "FormField";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ hasError = false, className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 text-table-body rounded-lg border bg-surface text-gray-800 placeholder:text-muted-light shadow-xs focus:outline-none focus:ring-2 transition-colors disabled:bg-surface-subtle disabled:text-muted disabled:cursor-not-allowed ${
          hasError
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-primary/20"
        } ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError = false, className = "", children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`w-full px-3 py-2 text-table-body rounded-lg border bg-surface text-gray-800 shadow-xs focus:outline-none focus:ring-2 transition-colors disabled:bg-surface-subtle disabled:text-muted disabled:cursor-not-allowed ${
          hasError
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-primary/20"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError = false, className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full px-3 py-2 text-table-body rounded-lg border bg-surface text-gray-800 placeholder:text-muted-light shadow-xs focus:outline-none focus:ring-2 transition-colors disabled:bg-surface-subtle disabled:text-muted disabled:cursor-not-allowed ${
          hasError
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-primary/20"
        } ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export default FormField;
