"use client";

import React from "react";
import Link from "next/link";

export interface FilterTabItem {
  id: string | number;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  href?: string;
}

export interface FilterTabsProps {
  tabs: FilterTabItem[];
  activeTab?: string | number;
  onTabChange?: (tabId: string | number) => void;
  className?: string;
  tabClassName?: string;
  size?: "sm" | "md";
}

export function FilterTabs({
  tabs,
  activeTab,
  onTabChange,
  className = "",
  tabClassName = "",
  size = "sm",
}: FilterTabsProps) {
  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  }[size];

  return (
    <div
      className={`inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold gap-1 flex-wrap ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab !== undefined ? String(activeTab) === String(tab.id) : false;
        const baseClasses = `${sizeStyles} rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 font-bold ${
          isActive
            ? "bg-primary text-white shadow-xs"
            : "text-muted hover:text-gray-900 hover:bg-surface/60"
        } ${tabClassName}`;

        const innerContent = (
          <>
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-surface text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </>
        );

        if (tab.href) {
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={baseClasses}
              role="tab"
              aria-selected={isActive}
            >
              {innerContent}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange?.(tab.id)}
            className={baseClasses}
            role="tab"
            aria-selected={isActive}
          >
            {innerContent}
          </button>
        );
      })}
    </div>
  );
}
