"use client";

import React from "react";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";

export default function SidebarAnnouncementBadge() {
  const { unreadCount } = useAnnouncementNotification();

  if (!unreadCount || unreadCount <= 0) {
    return null;
  }

  return (
    <span className="ms-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-600 rounded-full min-w-[18px] shadow-xs animate-pulse">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
      </span>
      <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
    </span>
  );
}
