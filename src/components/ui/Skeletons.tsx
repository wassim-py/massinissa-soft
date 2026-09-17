import React from "react";

export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-surface-muted animate-pulse rounded-lg ${className}`} />
  );
}

/**
 * Standard table skeleton for list views (students, teachers, classes, payments, etc.)
 */
export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 bg-surface rounded-2xl border border-border shadow-xs animate-pulse">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-surface-muted rounded-lg" />
          <div className="h-4 w-72 bg-surface-muted/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="h-10 w-full sm:w-64 bg-surface-muted rounded-xl" />
          <div className="h-10 w-10 bg-surface-muted rounded-xl shrink-0" />
          <div className="h-10 w-10 bg-surface-muted rounded-xl shrink-0" />
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-hidden rounded-xl border border-border/70">
        {/* Table header */}
        <div className="bg-surface-subtle/80 border-b border-border p-3.5 flex items-center justify-between gap-4">
          {[...Array(columns)].map((_, i) => (
            <div
              key={i}
              className={`h-4 bg-surface-muted rounded ${
                i === 0 ? "w-28" : i === 1 ? "w-36" : "w-20"
              }`}
            />
          ))}
        </div>

        {/* Table rows */}
        <div className="divide-y divide-border/50">
          {[...Array(rows)].map((_, r) => (
            <div
              key={r}
              className="p-4 flex items-center justify-between gap-4 bg-surface"
            >
              {[...Array(columns)].map((_, c) => (
                <div
                  key={c}
                  className={`h-4 bg-surface-muted/70 rounded ${
                    c === 0
                      ? "w-24"
                      : c === 1
                      ? "w-40"
                      : c === 2
                      ? "w-16"
                      : "w-20"
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between pt-2">
        <div className="h-4 w-32 bg-surface-muted/60 rounded" />
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-8 bg-surface-muted rounded-lg" />
          <div className="h-8 w-8 bg-surface-muted rounded-lg" />
          <div className="h-8 w-8 bg-surface-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * Grid card skeleton (classes, attendance cards, workshops, formations)
 */
export function GridSkeleton({
  cards = 6,
}: {
  cards?: number;
}) {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 animate-pulse">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-surface-muted rounded-lg" />
          <div className="h-4 w-80 bg-surface-muted/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-48 bg-surface-muted rounded-xl" />
          <div className="h-10 w-24 bg-surface-muted rounded-xl" />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(cards)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-surface rounded-2xl border border-border shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-32 bg-surface-muted rounded-md" />
              <div className="h-6 w-16 bg-surface-muted rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-surface-muted/60 rounded" />
              <div className="h-4 w-3/4 bg-surface-muted/60 rounded" />
            </div>
            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <div className="h-4 w-20 bg-surface-muted/70 rounded" />
              <div className="h-8 w-24 bg-surface-muted rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Detail profile skeleton (student profile, teacher profile, class details)
 */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 animate-pulse">
      {/* Top Banner */}
      <div className="p-6 bg-surface rounded-2xl border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-surface-muted shrink-0" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-surface-muted rounded-lg" />
            <div className="h-4 w-32 bg-surface-muted/70 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-surface-muted rounded-lg" />
          <div className="h-9 w-28 bg-surface-muted rounded-lg" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <div className="h-9 w-28 bg-surface-muted rounded-lg" />
        <div className="h-9 w-28 bg-surface-muted rounded-lg" />
        <div className="h-9 w-28 bg-surface-muted rounded-lg" />
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-6 bg-surface rounded-2xl border border-border shadow-xs space-y-4">
          <div className="h-6 w-40 bg-surface-muted rounded-lg" />
          <div className="h-24 bg-surface-muted/50 rounded-xl" />
          <div className="h-36 bg-surface-muted/40 rounded-xl" />
        </div>
        <div className="p-6 bg-surface rounded-2xl border border-border shadow-xs space-y-4">
          <div className="h-6 w-32 bg-surface-muted rounded-lg" />
          <div className="h-48 bg-surface-muted/40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Timetable skeleton for lessons view
 */
export function TimetableSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 animate-pulse">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-44 bg-surface-muted rounded-lg" />
          <div className="h-4 w-60 bg-surface-muted/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-40 bg-surface-muted rounded-xl" />
          <div className="h-10 w-32 bg-surface-muted rounded-xl" />
        </div>
      </div>

      {/* Timetable grid */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-xs overflow-hidden">
        <div className="grid grid-cols-7 gap-3 mb-3 border-b border-border pb-3">
          {[...Array(7)].map((_, d) => (
            <div key={d} className="h-6 bg-surface-muted rounded-md text-center" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-3 h-96">
          {[...Array(7)].map((_, col) => (
            <div key={col} className="space-y-3">
              <div className="h-20 bg-surface-muted/50 rounded-xl" />
              <div className="h-16 bg-surface-muted/30 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Finance / Analytics skeleton
 */
export function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-surface-muted rounded-lg" />
          <div className="h-4 w-72 bg-surface-muted/60 rounded-md" />
        </div>
        <div className="h-10 w-48 bg-surface-muted rounded-xl" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-surface rounded-2xl border border-border shadow-xs space-y-3"
          >
            <div className="h-4 w-28 bg-surface-muted/70 rounded" />
            <div className="h-8 w-36 bg-surface-muted rounded-lg" />
            <div className="h-3 w-20 bg-surface-muted/50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart & Table */}
      <div className="p-6 bg-surface rounded-2xl border border-border shadow-xs space-y-4">
        <div className="h-6 w-44 bg-surface-muted rounded-lg" />
        <div className="h-64 bg-surface-muted/40 rounded-xl" />
      </div>
    </div>
  );
}
