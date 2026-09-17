"use client";

import Image from "next/image";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";

const TableSearch = ({
  placeholder,
  debounceMs = 300,
}: {
  placeholder?: string;
  debounceMs?: number;
}) => {
  const t = useTranslations("search");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const urlSearch = searchParams.get("search")?.toString() || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const isFirstMount = useRef(true);

  // Synchronize state if URL changes externally (e.g., browser back/forward)
  useEffect(() => {
    setSearchTerm(urlSearch);
  }, [urlSearch]);

  // Debounced live search as user types
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const currentInUrl = searchParams.get("search")?.toString() || "";
      if (searchTerm.trim() !== currentInUrl.trim()) {
        const params = new URLSearchParams(searchParams.toString());
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        } else {
          params.delete("search");
        }
        params.delete("page"); // Reset to page 1 on new search
        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, debounceMs, pathname, router, searchParams]);

  const handleImmediateSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("search", value.trim());
    } else {
      params.delete("search");
    }
    params.delete("page");
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleClear = () => {
    setSearchTerm("");
    handleImmediateSearch("");
  };

  return (
    <div className="w-full md:w-auto flex items-center gap-2 text-table-body rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
      <Image src="/search.png" alt="" width={14} height={14} className="opacity-60 shrink-0" />
      <input
        type="text"
        placeholder={placeholder || t("placeholder")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
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
          className="text-muted hover:text-gray-700 transition-colors p-0.5 rounded-full hover:bg-surface-subtle"
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
