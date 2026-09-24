"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  useAnnouncementNotification,
  DashboardAnnouncementData,
} from "./AnnouncementNotificationProvider";
import DashboardAnnouncementItem from "./DashboardAnnouncementItem";
import FormModal from "@/components/FormModal";

interface DashboardAnnouncementsLiveProps {
  initialData: DashboardAnnouncementData[];
  branchId?: number;
  isOwner: boolean;
  role: string | null;
  userBranchIds: number[];
  activeBranchId?: number | null;
}

export default function DashboardAnnouncementsLive({
  initialData,
  branchId,
  isOwner,
  role,
  userBranchIds,
  activeBranchId,
}: DashboardAnnouncementsLiveProps) {
  const t = useTranslations("dashboard.announcements");
  const locale = useLocale();
  const dateLocale = locale === "ar" ? "ar-DZ-u-nu-latn" : "fr-FR";
  const { dashboardAnnouncements } = useAnnouncementNotification();

  const [items, setItems] = useState<DashboardAnnouncementData[]>(initialData);

  // Directly fetch latest announcements for this specific branch / view
  const fetchLiveAnnouncements = useCallback(async () => {
    try {
      const q = branchId ? `&branchId=${branchId}` : "";
      const res = await fetch(`/api/announcements/check-new?_t=${Date.now()}${q}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.dashboardAnnouncements)) {
        setItems(data.dashboardAnnouncements);
      }
    } catch {
      // Ignore network errors
    }
  }, [branchId]);

  // Sync when provider's dashboardAnnouncements updates (from heartbeat or toast trigger)
  useEffect(() => {
    if (dashboardAnnouncements && dashboardAnnouncements.length > 0) {
      setItems(dashboardAnnouncements);
    }
  }, [dashboardAnnouncements]);

  // Listen to cross-tab broadcast and local window events for zero-latency sync
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("massinissa_announcements_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "ANNOUNCEMENT_CHANGED") {
          fetchLiveAnnouncements();
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }

    const onCustomUpdate = (e: any) => {
      if (Array.isArray(e.detail) && e.detail.length > 0) {
        setItems(e.detail);
      } else {
        fetchLiveAnnouncements();
      }
    };

    const onGeneralUpdate = () => {
      fetchLiveAnnouncements();
    };

    window.addEventListener(
      "massinissa:dashboard_announcements_updated",
      onCustomUpdate
    );
    window.addEventListener("massinissa:announcements_updated", onGeneralUpdate);

    return () => {
      try {
        bc?.close();
      } catch {
        // Ignore
      }
      window.removeEventListener(
        "massinissa:dashboard_announcements_updated",
        onCustomUpdate
      );
      window.removeEventListener(
        "massinissa:announcements_updated",
        onGeneralUpdate
      );
    };
  }, [fetchLiveAnnouncements]);

  const bgColors = [
    "bg-wsmSkyLight",
    "bg-wsmPurpleLight",
    "bg-wsmYellowLight",
  ];

  return (
    <div className="bg-white p-4 rounded-xl border border-border shadow-sm text-gray-800">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">{t("title")}</h1>
        <Link href="/list/announcements">
          <span className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            {t("viewAll")}
          </span>
        </Link>
      </div>
      <div className="flex flex-col gap-4 mt-4">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            {t("noAnnouncements")}
          </p>
        ) : (
          items.map((item, index) => {
            const bgColor = bgColors[index % bgColors.length];
            const authorLabel = item.authorBranchName
              ? t("authorBranch", { branch: item.authorBranchName })
              : t("authorGeneral");
            const targetLabel = item.targetBranchName
              ? t("targetBranchBadge", { branch: item.targetBranchName })
              : t("targetAllBadge");

            const canModify =
              role === "admin" &&
              (isOwner ||
                (item.authorBranchId &&
                  userBranchIds.includes(item.authorBranchId)));

            const rawDate =
              typeof item.date === "string" ? new Date(item.date) : item.date;
            const formattedDate = new Intl.DateTimeFormat(dateLocale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(rawDate);

            const rawExpiry = item.expiresAt
              ? typeof item.expiresAt === "string"
                ? new Date(item.expiresAt)
                : item.expiresAt
              : null;

            const formattedExpiry = rawExpiry
              ? new Intl.DateTimeFormat(dateLocale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(rawExpiry)
              : null;

            const expiresAtBadgeLabel = formattedExpiry
              ? t("expiresAtBadge", { date: formattedExpiry })
              : null;

            const actions = canModify ? (
              <div className="flex items-center gap-1">
                <FormModal
                  table="announcement"
                  type="update"
                  data={{
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    isPinned: item.isPinned,
                    branchId: item.branchId,
                    expiresAt: item.expiresAt,
                  }}
                />
                <FormModal
                  table="announcement"
                  type="delete"
                  id={item.id}
                />
              </div>
            ) : null;

            return (
              <DashboardAnnouncementItem
                key={item.id}
                item={{
                  ...item,
                  date: rawDate,
                  expiresAt: rawExpiry,
                }}
                bgColor={bgColor}
                authorLabel={authorLabel}
                targetLabel={targetLabel}
                newBadgeLabel={t("newBadge")}
                formattedDate={formattedDate}
                formattedExpiry={formattedExpiry}
                expiresAtBadgeLabel={expiresAtBadgeLabel}
                publishedAtTitle={t("publishedAt", { date: formattedDate })}
                actions={actions}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
