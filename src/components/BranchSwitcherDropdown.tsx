"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { setBranchAction } from "@/lib/actions";

interface Branch {
  id: number;
  name: string;
  address: string;
}

interface Props {
  branches: Branch[];
  activeBranchId: number;
  isOwner: boolean;
}

const branchIcons: Record<string, string> = {
  ECOLE: "🏫",
  ANNEX: "🏢",
  AMPHI: "🏛️",
};

export default function BranchSwitcherDropdown({
  branches,
  activeBranchId,
  isOwner,
}: Props) {
  const t = useTranslations("branchSwitcher");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentBranch =
    branches.find((b) => b.id === activeBranchId) || branches[0] || {
      id: 1,
      name: "ECOLE",
      address: "",
    };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (branchId: number) => {
    if (branchId === activeBranchId) {
      setIsOpen(false);
      return;
    }
    startTransition(async () => {
      // Set cookie in document as immediate fallback
      document.cookie = `x-branch-id=${branchId}; path=/; max-age=31536000; SameSite=Lax`;
      await setBranchAction(branchId);
      setIsOpen(false);
      router.refresh();
    });
  };

  const icon = branchIcons[currentBranch.name] || "🏢";

  // If user is not the owner, render a static badge showing their assigned branch
  if (!isOwner) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200/80 shadow-xs">
        <span className="text-base leading-none">{icon}</span>
        <div className="flex flex-col">
          <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">
            {t("currentBranch")}
          </span>
          <span className="text-xs font-bold text-gray-800">
            {currentBranch.name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-block text-start" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 hover:border-blue-400 shadow-xs transition-all duration-150 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
        title={t("switchBranch")}
      >
        <span className="text-lg leading-none">{icon}</span>
        <div className="flex flex-col text-start">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider">
            {t("currentBranch")}
          </span>
          <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            {currentBranch.name}
            {isPending && (
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            )}
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ms-1 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute start-0 mt-1.5 w-56 rounded-xl bg-white shadow-lg border border-gray-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 border-b border-gray-100 text-[11px] font-semibold text-gray-400">
            {t("selectBranch")}
          </div>

          <div className="p-1 space-y-0.5">
            {branches.map((branch) => {
              const isSelected = branch.id === currentBranch.id;
              const bIcon = branchIcons[branch.name] || "🏢";

              return (
                <button
                  key={branch.id}
                  onClick={() => handleSelect(branch.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-800 font-bold"
                      : "text-gray-700 hover:bg-gray-100 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{bIcon}</span>
                    <div className="flex flex-col text-start">
                      <span className="font-semibold">{branch.name}</span>
                      {branch.address && (
                        <span className="text-[10px] text-gray-400 font-normal truncate max-w-[140px]">
                          {branch.address}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-blue-600 shrink-0 ms-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
