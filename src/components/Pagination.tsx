"use client";

import { ITEM_PER_PAGE } from "@/lib/settings";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

const getPaginationRange = (currentPage: number, totalPages: number): (number | string)[] => {
  const siblingCount = 2;
  const totalNumbersToDisplay = siblingCount + 5;

  if (totalPages <= totalNumbersToDisplay) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftDots = leftSiblingIndex > 2;
  const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

  const firstPageIndex = 1;
  const lastPageIndex = totalPages;

  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, "...", lastPageIndex];
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1
    );
    return [firstPageIndex, "...", ...rightRange];
  }

  if (shouldShowLeftDots && shouldShowRightDots) {
    const middleRange = Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, i) => leftSiblingIndex + i
    );
    return [firstPageIndex, "...", ...middleRange, "...", lastPageIndex];
  }

  return [];
};

const Pagination = ({ count }: { count: number }) => {
  const t = useTranslations("pagination");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get("page")) || 1;
  const totalPages = Math.ceil(count / ITEM_PER_PAGE);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const pageNumbers = getPaginationRange(currentPage, totalPages);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="py-3 px-2 sm:px-4 flex items-center justify-between text-muted border-t border-border/60">
      <Button
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        onClick={() => changePage(currentPage - 1)}
      >
        {t("prev")}
      </Button>

      <div className="flex items-center gap-1.5 text-sm">
        {pageNumbers.map((page, index) => {
          if (typeof page === "string") {
            return (
              <span key={`dots-${index}`} className="px-1.5 text-muted-light">
                ...
              </span>
            );
          }
          const isActive = currentPage === page;
          return (
            <button
              key={page}
              className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center cursor-pointer select-none ${
                isActive
                  ? "bg-primary text-white shadow-xs"
                  : "text-gray-700 hover:bg-surface-subtle border border-border/70 bg-surface"
              }`}
              onClick={() => changePage(page)}
              aria-current={isActive ? "page" : undefined}
            >
              {page}
            </button>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => changePage(currentPage + 1)}
      >
        {t("next")}
      </Button>
    </div>
  );
};

export default Pagination;
