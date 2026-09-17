import React from "react";
import { Inbox, SearchX, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export interface Column<T = any> {
  header: React.ReactNode;
  accessor: string;
  className?: string;
  align?: "start" | "center" | "end";
}

export interface DataTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: "inbox" | "search";
  isLoading?: boolean;
  pagination?: React.ReactNode;
  className?: string;
  tableClassName?: string;
}

export function DataTable<T = any>({
  columns,
  data,
  renderRow,
  keyExtractor,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon = "inbox",
  isLoading = false,
  pagination,
  className = "",
  tableClassName = "",
}: DataTableProps<T>) {
  const t = useTranslations("common");
  const resolvedEmptyTitle = emptyTitle ?? t("noData");
  const resolvedEmptyDescription = emptyDescription ?? t("noResults");
  const EmptyIconComponent = emptyIcon === "search" ? SearchX : Inbox;

  return (
    <div className={`w-full flex flex-col ${className}`}>
      {/* RESPONSIVE SCROLL CONTAINER */}
      <div className="w-full overflow-x-auto rounded-lg border border-border/80 bg-surface shadow-xs">
        <table className={`w-full border-collapse text-start ${tableClassName}`}>
          <thead>
            <tr className="bg-surface-muted/60 border-b border-border text-start">
              {columns.map((col, index) => {
                const alignClass =
                  col.align === "center"
                    ? "text-center"
                    : col.align === "end"
                    ? "text-end"
                    : "text-start";
                return (
                  <th
                    key={col.accessor || index}
                    className={`py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider ${alignClass} ${
                      col.className || ""
                    }`}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-table-body text-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-3 text-muted">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm font-medium">{t("loading")}</span>
                  </div>
                </td>
              </tr>
            ) : data && data.length > 0 ? (
              data.map((item, idx) => {
                const row = renderRow(item, idx);
                // If user provided a tr element, return it directly or with key
                if (React.isValidElement(row)) {
                  const key = keyExtractor
                    ? keyExtractor(item, idx)
                    : (item as any)?.id ?? idx;
                  return React.cloneElement(row, { key: row.key ?? key });
                }
                return row;
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-16 px-4 text-center">
                  <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center text-muted mb-3">
                      <EmptyIconComponent className="w-6 h-6" />
                    </div>
                    <h4 className="text-card-title text-gray-800 font-semibold mb-1">
                      {resolvedEmptyTitle}
                    </h4>
                    <p className="text-form-helper text-muted mb-4 max-w-xs">
                      {resolvedEmptyDescription}
                    </p>
                    {emptyAction && <div>{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION CONTAINER */}
      {pagination && <div className="mt-4">{pagination}</div>}
    </div>
  );
}

export default DataTable;
