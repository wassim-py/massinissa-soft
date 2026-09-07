"use client";

import { ITEM_PER_PAGE } from "@/lib/settings";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// This is a utility function that generates the array of page numbers to display.
// It creates the truncated list with ellipses.
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
        let leftItemCount = 3 + 2 * siblingCount;
        let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
        return [...leftRange, "...", lastPageIndex];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
        let rightItemCount = 3 + 2 * siblingCount;
        let rightRange = Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
        return [firstPageIndex, "...", ...rightRange];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
        let middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
        return [firstPageIndex, "...", ...middleRange, "...", lastPageIndex];
    }

    return [];
};


const Pagination = ({ count }: { count: number }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const currentPage = Number(searchParams.get("page")) || 1;
  const totalPages = Math.ceil(count / ITEM_PER_PAGE);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const pageNumbers = getPaginationRange(currentPage, totalPages);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="p-4 flex items-center justify-between text-gray-500">
      <button
        disabled={!hasPrev}
        className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => changePage(currentPage - 1)}
      >
        Prev
      </button>

      <div className="flex items-center gap-2 text-sm">
        {pageNumbers.map((page, index) => {
          if (typeof page === 'string') {
            return <span key={`dots-${index}`} className="px-2">...</span>;
          }
          return (
            <button
              key={page}
              className={`px-2 rounded-sm ${
                currentPage === page ? "bg-lamaSky" : ""
              }`}
              onClick={() => changePage(page)}
            >
              {page}
            </button>
          );
        })}
      </div>

      <button
        className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!hasNext}
        onClick={() => changePage(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
