"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import dynamic from "next/dynamic";
import type { AccountItem } from "./AccountSection";
import type { BranchItem } from "./BranchSection";
import type { ClassroomItem } from "./ClassroomSection";
import type { TrimesterItem, AcademicYearInfo } from "./TrimesterSection";
import type { LevelItem } from "./LevelSection";
import type { FormationLanguageItem } from "./FormationLanguageSection";

const SectionLoading = () => (
  <div className="p-8 text-center text-muted animate-pulse bg-surface rounded-xl border border-border/60">
    <div className="h-6 w-48 bg-surface-muted rounded mx-auto mb-4" />
    <div className="h-24 bg-surface-muted rounded mx-auto max-w-lg" />
  </div>
);

const AccountSection = dynamic(() => import("./AccountSection"), { loading: SectionLoading });
const BranchSection = dynamic(() => import("./BranchSection"), { loading: SectionLoading });
const ClassroomSection = dynamic(() => import("./ClassroomSection"), { loading: SectionLoading });
const TrimesterSection = dynamic(() => import("./TrimesterSection"), { loading: SectionLoading });
const LevelSection = dynamic(() => import("./LevelSection"), { loading: SectionLoading });
const FormationLanguageSection = dynamic(() => import("./FormationLanguageSection"), { loading: SectionLoading });
import {
  KeyRound,
  Building2,
  DoorOpen,
  CalendarDays,
  Settings,
  GraduationCap,
  Languages,
} from "lucide-react";

interface ConfigurationClientProps {
  accounts: AccountItem[];
  branches: Array<{ id: number; name: string; address?: string; phone?: string | null; manager?: string | null; classroomsCount?: number }>;
  classrooms: ClassroomItem[];
  subjects?: any[];
  allTeachers?: Array<{ id: string; name: string }>;
  trimesters?: TrimesterItem[];
  academicYear?: AcademicYearInfo | null;
  academicYears?: any[];
  levels?: LevelItem[];
  formationLanguages?: FormationLanguageItem[];
  initialTab?: string;
}

export default function ConfigurationClient({
  accounts,
  branches,
  classrooms,
  subjects = [],
  allTeachers = [],
  trimesters = [],
  academicYear = null,
  academicYears = [],
  levels = [],
  formationLanguages = [],
  initialTab = "accounts",
}: ConfigurationClientProps) {
  const t = useTranslations("configuration");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const validTabs = ["accounts", "branches", "classrooms", "levels", "formationLanguages", "trimesters"];
  const rawTab = searchParams.get("tab") || initialTab || "accounts";
  const currentTab = validTabs.includes(rawTab) ? rawTab : "accounts";

  const handleTabChange = (tabKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabKey);
    router.push(`${pathname}?${params.toString()}`);
  };

  const tabs = [
    {
      key: "accounts",
      label: t("tabs.accounts"),
      icon: KeyRound,
      count: accounts.length,
      color: "text-primary bg-primary-light",
    },
    {
      key: "branches",
      label: t("tabs.branches"),
      icon: Building2,
      count: branches.length,
      color: "text-secondary bg-secondary-light",
    },
    {
      key: "classrooms",
      label: t("tabs.classrooms"),
      icon: DoorOpen,
      count: classrooms.length,
      color: "text-accent-hover bg-accent-light",
    },
    {
      key: "levels",
      label: t("tabs.levels"),
      icon: GraduationCap,
      count: levels.length,
      color: "text-purple-700 bg-purple-50",
    },
    {
      key: "formationLanguages",
      label: t("tabs.formationLanguages"),
      icon: Languages,
      count: formationLanguages.length,
      color: "text-amber-700 bg-amber-50",
    },
    {
      key: "trimesters",
      label: t("tabs.trimesters"),
      icon: CalendarDays,
      count: trimesters.length,
      color: "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <BackButton />
          <div className="flex items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center text-primary shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-page-title text-gray-900 font-bold tracking-tight">
                {t("title")}
              </h1>
              <p className="text-form-helper text-muted">
                {t("subtitle")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-px overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "border-primary text-gray-900 bg-surface-subtle/50"
                  : "border-transparent text-muted hover:text-gray-900 hover:bg-surface-subtle/30"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? tab.color : "text-muted bg-surface-muted"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span>{tab.label}</span>
              <span
                className={`text-xs px-1.5 py-0.2 rounded-full font-mono ${
                  isActive
                    ? "bg-primary-light text-primary font-bold"
                    : "bg-surface-muted text-muted font-medium"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="w-full">
        {currentTab === "accounts" && (
          <AccountSection accounts={accounts} branches={branches} />
        )}
        {currentTab === "branches" && (
          <BranchSection branches={branches} />
        )}
        {currentTab === "classrooms" && (
          <ClassroomSection classrooms={classrooms} branches={branches} />
        )}
        {currentTab === "levels" && (
          <LevelSection levels={levels} />
        )}
        {currentTab === "formationLanguages" && (
          <FormationLanguageSection languages={formationLanguages} />
        )}
        {currentTab === "trimesters" && (
          <TrimesterSection
            trimesters={trimesters}
            academicYear={academicYear}
            academicYears={academicYears}
          />
        )}
      </div>
    </div>
  );
}
