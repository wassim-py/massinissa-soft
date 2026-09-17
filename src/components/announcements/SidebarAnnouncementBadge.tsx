"use client";

import React from "react";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";

export default function SidebarAnnouncementBadge() {
  const { unreadCount } = useAnnouncementNotification();

  if (!unreadCount || unreadCount <= 0) {
    return null;
  }

  return (
    <span className="ms-auto inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full min-w-[18px] shadow-xs animate-pulse">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
