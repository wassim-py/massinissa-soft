"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { Search, ChevronDown, X, Check } from "lucide-react";

export interface GroupOption {
  id: string | number;
  name: string;
  secondaryLabel?: string;
}

export interface SearchableGroupSelectProps {
  options: GroupOption[];
  value: string | number | "";
  onChange: (value: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allOptionLabel?: string;
  allOptionValue?: string | number;
  allowClear?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  required?: boolean;
  name?: string;
  id?: string;
}

export const SearchableGroupSelect: React.FC<SearchableGroupSelectProps> = ({
  options = [],
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  allOptionLabel,
  allOptionValue = "all",
  allowClear = false,
  hasError = false,
  disabled = false,
  className = "",
  buttonClassName = "",
  dropdownClassName = "",
  required = false,
  name,
  id,
}) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const defaultPlaceholder = isAr ? "اختر الفوج" : "Sélectionner un groupe";
  const defaultSearchPlaceholder = isAr ? "بحث عن فوج..." : "Rechercher un groupe...";
  const emptyMessage = isAr ? "لم يتم العثور على أي فوج" : "Aucun groupe trouvé";

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const selectedOption = useMemo(() => {
    if (value === "" || value === undefined || value === null) return null;
    return options.find((opt) => String(opt.id) === String(value)) || null;
  }, [options, value]);

  const isAllSelected = Boolean(allOptionLabel && String(value) === String(allOptionValue));

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter((opt) => {
      const nameMatch = opt.name.toLowerCase().includes(term);
      const secondaryMatch = opt.secondaryLabel?.toLowerCase().includes(term);
      return nameMatch || secondaryMatch;
    });
  }, [options, searchTerm]);

  const handleSelect = (optionId: string | number) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(allOptionLabel ? allOptionValue : "");
    setIsOpen(false);
  };

  const displayText = useMemo(() => {
    if (isAllSelected && allOptionLabel) {
      return allOptionLabel;
    }
    if (selectedOption) {
      if (selectedOption.secondaryLabel) {
        return `${selectedOption.name} (${selectedOption.secondaryLabel})`;
      }
      return selectedOption.name;
    }
    return placeholder || defaultPlaceholder;
  }, [isAllSelected, allOptionLabel, selectedOption, placeholder, defaultPlaceholder]);

  const isSelected = selectedOption !== null || isAllSelected;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-start ${className}`}
      id={id}
    >
      {name && <input type="hidden" name={name} value={value ?? ""} required={required} />}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-3 py-2 text-table-body rounded-lg border bg-surface text-gray-800 shadow-xs focus:outline-none focus:ring-2 transition-colors disabled:bg-surface-subtle disabled:text-muted disabled:cursor-not-allowed flex items-center justify-between gap-2 min-h-[42px] ${
          hasError
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-primary/20"
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={`truncate flex-1 text-start ${
            isSelected ? "text-gray-900 font-medium" : "text-muted"
          }`}
        >
          {displayText}
        </span>

        <div className="flex items-center gap-1 shrink-0 text-muted">
          {allowClear && isSelected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-1 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              title={isAr ? "إلغاء التحديد" : "Effacer la sélection"}
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 w-full bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden flex flex-col min-w-[220px] max-w-[420px] animate-in fade-in-50 zoom-in-95 duration-100 ${dropdownClassName}`}
          role="listbox"
        >
          {/* Search bar inside dropdown */}
          <div className="p-2 border-b border-border/80 bg-surface-subtle/50 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-muted absolute start-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder || defaultSearchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full ps-8 pe-7 py-1.5 text-xs bg-surface border border-border rounded-lg text-gray-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute end-2 text-muted hover:text-gray-700 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-border/40 p-1 font-sans">
            {/* "All" Option for filter selectors */}
            {allOptionLabel && (!searchTerm.trim() || allOptionLabel.toLowerCase().includes(searchTerm.toLowerCase())) && (
              <div
                role="option"
                aria-selected={isAllSelected}
                onClick={() => handleSelect(allOptionValue)}
                className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors ${
                  isAllSelected
                    ? "bg-primary-light text-primary font-bold"
                    : "text-gray-800 hover:bg-surface-subtle font-medium"
                }`}
              >
                <span>{allOptionLabel}</span>
                {isAllSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </div>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isItemActive = String(opt.id) === String(value);
                return (
                  <div
                    key={opt.id}
                    role="option"
                    aria-selected={isItemActive}
                    onClick={() => handleSelect(opt.id)}
                    className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors gap-2 ${
                      isItemActive
                        ? "bg-primary-light text-primary font-bold"
                        : "text-gray-800 hover:bg-surface-subtle"
                    }`}
                  >
                    <span className="truncate">{opt.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.secondaryLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-subtle text-muted border border-border/60">
                          {opt.secondaryLabel}
                        </span>
                      )}
                      {isItemActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-muted">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableGroupSelect;
