import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "outline"
  | "ghost"
  | "soft"
  | "soft-danger"
  | "dark";

export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover/90 shadow-sm border border-transparent",
  secondary:
    "bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-hover/90 shadow-sm border border-transparent",
  danger:
    "bg-danger text-white hover:bg-danger-hover active:bg-danger-hover/90 shadow-sm border border-transparent",
  outline:
    "border border-border bg-surface text-gray-700 hover:bg-surface-subtle hover:text-gray-900 active:bg-surface-subtle/80 shadow-xs",
  ghost:
    "text-gray-700 hover:bg-surface-subtle hover:text-gray-900 active:bg-surface-subtle/80 border border-transparent",
  soft:
    "bg-primary-soft text-primary-hover hover:bg-primary-soft/80 active:bg-primary-soft/70 border border-transparent",
  "soft-danger":
    "bg-danger-soft text-danger-text hover:bg-danger-soft/80 active:bg-danger-soft/70 border border-transparent",
  dark:
    "bg-gray-900 text-white hover:bg-black active:bg-black/90 shadow-sm border border-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-medium rounded-lg gap-1.5",
  md: "px-4 py-2 text-sm font-medium rounded-lg gap-2",
  lg: "px-5 py-2.5 text-base font-semibold rounded-lg gap-2.5",
  icon: "w-8 h-8 rounded-full p-1.5 flex items-center justify-center shrink-0",
  "icon-sm": "w-7 h-7 rounded-full p-1 flex items-center justify-center shrink-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const isIconButton = size === "icon" || size === "icon-sm";
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98] ${
          variantClasses[variant]
        } ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export default Button;
