"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import { Bell } from "lucide-react";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";
import { useTranslations } from "next-intl";

export default function NavbarAnnouncementBadge() {
  const { unreadCount } = useAnnouncementNotification();
  const t = useTranslations("announcements");

  return (
    <Link
      href="/list/announcements"
      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border border-gray-200 sm:border-transparent sm:hover:border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 shadow-xs sm:shadow-none sm:hover:shadow-xs transition-all focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shrink-0 group relative"
      title={t("title")}
      aria-label={t("title")}
    >
      <Bell className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0 transition-transform group-hover:scale-110 text-gray-700" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto flex items-center justify-center pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex items-center justify-center px-1 min-w-[16px] h-4 text-[9px] font-bold leading-none text-white bg-red-600 rounded-full border border-white shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        </span>
      )}
    </Link>
  );
}
