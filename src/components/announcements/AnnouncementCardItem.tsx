"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAnnouncementNotification } from "./AnnouncementNotificationProvider";

interface AnnouncementCardItemProps {
  announcement: {
    id: number;
    title: string;
    description: string;
    date: Date;
    expiresAt: Date | null;
    branchId: number | null;
    authorBranchId: number | null;
    authorBranchName: string | null;
    targetBranchName: string | null;
    isPinned: boolean;
    isNew: boolean;
  };
  isPinned?: boolean;
  authorLabel: string;
  targetLabel: string;
  formattedExpiry: string | null;
  expiresAtBadgeLabel: string | null;
  publishedAtLabel: string;
  newBadgeLabel: string;
  actions?: React.ReactNode;
}

export default function AnnouncementCardItem({
  announcement,
  isPinned = false,
  authorLabel,
  targetLabel,
  formattedExpiry,
  expiresAtBadgeLabel,
  publishedAtLabel,
  newBadgeLabel,
  actions,
}: AnnouncementCardItemProps) {
  const { isViewed, markAsViewed } = useAnnouncementNotification();
  const [hovered, setHovered] = useState<boolean>(false);

  const isAlreadyViewed = isViewed(announcement.id);
  const isNewActive = announcement.isNew && !isAlreadyViewed && !hovered;

  const handleMouseEnter = () => {
    if (announcement.isNew && !isAlreadyViewed && !hovered) {
      setHovered(true);
      markAsViewed(announcement.id);
    }
  };

  const isTemporary = Boolean(announcement.expiresAt);
  const normalBorder = isPinned ? "border-accent/40" : "border-border/80";

  return (
    <div className="h-full">
      <Card
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleMouseEnter}
        onClick={handleMouseEnter}
        className={`flex flex-col h-full border transition-all duration-700 ease-out ${
          isPinned
            ? "md:col-span-2 lg:col-span-3 bg-accent-light/60 shadow-xs"
            : "bg-surface shadow-xs hover:shadow-sm"
        } ${
          isNewActive
            ? "announcement-border-flash"
            : normalBorder
        }`}
      >
      <CardContent className="p-5 sm:p-6 flex flex-col flex-grow justify-between gap-4">
        <div>
          <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
            <h3
              className={`text-card-title font-bold tracking-tight ${
                isPinned ? "text-amber-950" : "text-gray-900"
              }`}
            >
              {announcement.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {announcement.isNew && !isAlreadyViewed && (
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
                variant={isPinned ? "accent" : "neutral"}
                size="sm"
                withDot={isPinned}
              >
                {targetLabel}
              </Badge>
              <Badge variant="neutral" size="sm">
                {authorLabel}
              </Badge>
              {isTemporary && formattedExpiry && expiresAtBadgeLabel && (
                <Badge variant="warning" size="sm">
                  {expiresAtBadgeLabel}
                </Badge>
              )}
            </div>
          </div>
          <p
            className={`text-table-body leading-relaxed whitespace-pre-line ${
              isPinned ? "text-amber-900/90" : "text-gray-700"
            }`}
          >
            {announcement.description}
          </p>
        </div>

        <div className="flex justify-between items-center text-form-helper text-muted border-t border-border/60 pt-3">
          <span className="text-xs">
            {publishedAtLabel}
          </span>
          {actions}
        </div>
      </CardContent>
    </Card>
  </div>
  );
}
