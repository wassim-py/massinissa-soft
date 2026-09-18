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
      className="relative inline-flex items-center justify-center p-1.5 sm:p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/20 shrink-0 group"
      title={t("title")}
      aria-label={t("title")}
    >
      <Bell className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110 text-gray-700" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 rtl:-left-0.5 rtl:right-auto flex items-center justify-center pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-600 rounded-full min-w-[18px] border-2 border-white shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        </span>
      )}
    </Link>
  );
}
