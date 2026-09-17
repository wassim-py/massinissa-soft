"use client";

import React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { CreditCard, CalendarCheck, BookOpen, GraduationCap } from "lucide-react";

interface GroupTabsProps {
  classId: number;
  activeTab: "payments" | "attendance" | "books";
  hasBooks?: boolean;
  isFormation?: boolean;
}

export default function GroupTabs({
  classId,
  activeTab,
  hasBooks = true,
  isFormation = false,
}: GroupTabsProps) {
  const t = useTranslations("classes");
  const locale = useLocale();

  const tabs = [
    ...(isFormation
      ? [
          {
            id: "formation" as const,
            label: locale === "ar" ? "تفاصيل التكوين" : "Détails de la formation",
            icon: GraduationCap,
            href: `/list/formations/${classId}`,
          },
        ]
      : []),
    {
      id: "payments" as const,
      label: t("tabPayments"),
      icon: CreditCard,
      href: `/list/payments/class/${classId}`,
    },
    {
      id: "attendance" as const,
      label: t("tabAttendance"),
      icon: CalendarCheck,
      href: `/list/attendance/class/${classId}`,
    },
    ...(hasBooks && !isFormation
      ? [
          {
            id: "books" as const,
            label: t("tabBooks"),
            icon: BookOpen,
            href: `/list/classes/${classId}?tab=books`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex items-center gap-2 border-b border-border pb-3 mb-6 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              isActive
                ? "bg-primary text-white shadow-xs font-bold"
                : "bg-surface-muted text-gray-700 hover:bg-gray-200/80 hover:text-gray-900 border border-border/60"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-muted"}`} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
