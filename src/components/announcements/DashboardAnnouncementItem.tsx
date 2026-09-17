"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";

interface DashboardAnnouncementItemProps {
  item: {
    id: number;
    title: string;
    description: string;
    date: Date;
    isPinned: boolean;
    authorBranchId: number | null;
    authorBranchName: string | null;
    branchId: number | null;
    targetBranchName: string | null;
    expiresAt: Date | null;
    isNew: boolean;
  };
  bgColor: string;
  authorLabel: string;
  targetLabel: string;
  newBadgeLabel: string;
  formattedDate: string;
  formattedExpiry: string | null;
  expiresAtBadgeLabel: string | null;
  publishedAtTitle: string;
  actions?: React.ReactNode;
}

export default function DashboardAnnouncementItem({
  item,
  bgColor,
  authorLabel,
  targetLabel,
  newBadgeLabel,
  formattedExpiry,
  expiresAtBadgeLabel,
  publishedAtTitle,
  actions,
}: DashboardAnnouncementItemProps) {
  const { isViewed, markAsViewed } = useAnnouncementNotification();
  const [hovered, setHovered] = useState<boolean>(false);

  const isAlreadyViewed = isViewed(item.id);
  const isNewActive = item.isNew && !isAlreadyViewed && !hovered;

  const handleMouseEnter = () => {
    if (item.isNew && !isAlreadyViewed && !hovered) {
      setHovered(true);
      markAsViewed(item.id);
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleMouseEnter}
      className={`${bgColor} rounded-xl p-4 border transition-all duration-700 ease-out hover:shadow-xs ${
        isNewActive
          ? "announcement-border-flash"
          : "border-black/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900 leading-snug">{item.title}</h2>
            {item.isNew && !isAlreadyViewed && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide uppercase bg-red-600 text-white shadow-xs ring-1 ring-white/60 select-none transition-all duration-500 overflow-hidden ${
                  hovered
                    ? "opacity-0 max-w-0 scale-90 -mr-2 pointer-events-none"
                    : "max-w-[150px] opacity-100 scale-100"
                }`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                <span>{newBadgeLabel}</span>
              </span>
            )}
            <Badge
              variant={item.isPinned ? "accent" : "neutral"}
              size="sm"
              withDot={item.isPinned}
              className="bg-white/90 border-border/80 text-gray-700 font-medium"
            >
              {targetLabel}
            </Badge>
            <Badge
              variant="neutral"
              size="sm"
              className="bg-white/90 border-border/80 text-gray-700 font-medium"
            >
              {authorLabel}
            </Badge>
            {formattedExpiry && expiresAtBadgeLabel && (
              <Badge variant="warning" size="sm">
                {expiresAtBadgeLabel}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs text-gray-500 bg-white/90 border border-black/[0.04] rounded-md px-2 py-1 whitespace-nowrap shadow-2xs"
            title={publishedAtTitle}
          >
            {publishedAtTitle}
          </span>
          {actions}
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed whitespace-pre-line">
        {item.description}
      </p>
    </div>
  );
}
