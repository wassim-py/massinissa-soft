"use client";

import { useEffect } from "react";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";

export default function MarkAnnouncementsRead() {
  const { markAllAsRead } = useAnnouncementNotification();

  useEffect(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  return null;
}
