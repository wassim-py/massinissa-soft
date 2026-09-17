import React from "react";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  withDot?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
  primary: {
    container: "bg-primary-light text-primary-hover border-primary-soft/60",
    dot: "bg-primary",
  },
  secondary: {
    container: "bg-secondary-light text-secondary-hover border-secondary-soft/60",
    dot: "bg-secondary",
  },
  accent: {
    container: "bg-accent-light text-accent-hover border-accent-soft/60",
    dot: "bg-accent",
  },
  success: {
    container: "bg-success-light text-success-text border-success-soft",
    dot: "bg-success",
  },
  warning: {
    container: "bg-warning-light text-warning-text border-warning-soft",
    dot: "bg-warning",
  },
  danger: {
    container: "bg-danger-light text-danger-text border-danger-soft",
    dot: "bg-danger",
  },
  neutral: {
    container: "bg-surface-subtle text-muted-dark border-border",
    dot: "bg-muted",
  },
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px] leading-4 gap-1.5",
  md: "px-2.5 py-1 text-badge leading-4 gap-1.5",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      size = "md",
      withDot = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const { container, dot } = variantStyles[variant] || variantStyles.neutral;
    const sizeStyle = sizeStyles[size] || sizeStyles.md;

    return (
      <span
        ref={ref}
        className={`inline-flex items-center font-medium rounded-full border transition-colors select-none whitespace-nowrap [&>svg]:shrink-0 ${sizeStyle} ${container} ${className}`}
        {...props}
      >
        {withDot && (
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";

export default Badge;
