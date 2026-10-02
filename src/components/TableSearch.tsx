"use client";

import Image from "next/image";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { X } from "lucide-react";

const TableSearch = ({
  placeholder,
  debounceMs = 350,
}: {
  placeholder?: string;
  debounceMs?: number;
}) => {
  const t = useTranslations("search");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const urlSearch = searchParams.get("search")?.toString() || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const isFocusedRef = useRef(false);
  const isFirstMount = useRef(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Track the latest search term pushed to the router by this component
  // to prevent stale in-flight server responses from overwriting active user typing
  const lastPushedSearchRef = useRef<string | null>(null);

  // Synchronize state if URL changes externally (e.g. browser back/forward, tab switches)
  // CRITICAL: NEVER overwrite user input while the user is actively typing or input is focused!
  useEffect(() => {
    // If the URL matches what we recently pushed, mark it as acknowledged
    if (lastPushedSearchRef.current !== null && urlSearch.trim() === lastPushedSearchRef.current.trim()) {
      return;
    }

    // Never overwrite while the user is actively focused on this input
    if (isFocusedRef.current) {
      return;
    }

    // External change (e.g. browser back/forward or external navigation)
    setSearchTerm(urlSearch);
    lastPushedSearchRef.current = null;
  }, [urlSearch]);

  const executeSearch = useCallback((value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const currentInUrl = searchParamsRef.current.get("search")?.toString() || "";
    const trimmed = value.trim();

    if (trimmed !== currentInUrl.trim()) {
      lastPushedSearchRef.current = trimmed;
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (trimmed) {
        params.set("search", trimmed);
      } else {
        params.delete("search");
      }
      params.delete("page"); // Reset to page 1 on new search
      const queryString = params.toString();
      const targetUrl = queryString ? `${pathnameRef.current}?${queryString}` : pathnameRef.current;

      startTransition(() => {
        router.replace(targetUrl, { scroll: false });
      });
    }
  }, [router]);

  // Debounced live search as user types
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const currentInUrl = searchParamsRef.current.get("search")?.toString() || "";
    // If searchTerm matches what's currently in the URL, clear any pending timer and do nothing
    if (searchTerm.trim() === currentInUrl.trim()) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      executeSearch(searchTerm);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [searchTerm, debounceMs, executeSearch]);

  const handleImmediateSearch = (value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    executeSearch(value);
  };

  const handleClear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSearchTerm("");
    lastPushedSearchRef.current = "";
    executeSearch("");
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    // When blurring, if there is a pending debounced search that differs from URL, flush it immediately
    const currentInUrl = searchParamsRef.current.get("search")?.toString() || "";
    if (searchTerm.trim() !== currentInUrl.trim()) {
      handleImmediateSearch(searchTerm);
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  return (
    <div className="w-full md:w-auto flex items-center gap-2 text-table-body rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
      <Image src="/search.png" alt="" width={14} height={14} className="opacity-60 shrink-0" />
      <input
        type="text"
        placeholder={placeholder || t("placeholder")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleImmediateSearch(searchTerm);
          }
        }}
        className="w-full sm:w-[260px] p-0 bg-transparent outline-none text-gray-800 placeholder:text-muted text-table-body"
      />
      {searchTerm && (
        <button
          type="button"
          onClick={handleClear}
          className="text-muted hover:text-gray-700 transition-colors p-0.5 rounded-full hover:bg-surface-subtle cursor-pointer"
          title={t("clearSearch")}
          aria-label={t("clearSearch")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default TableSearch;
