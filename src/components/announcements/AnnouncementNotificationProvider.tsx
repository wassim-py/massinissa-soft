"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useTransition,
} from "react";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Megaphone, ArrowRight, X } from "lucide-react";

interface AnnouncementNotificationContextType {
  unreadCount: number;
  markAllAsRead: () => void;
  latestId: number;
  viewedIds: number[];
  markAsViewed: (id: number) => void;
  isViewed: (id: number) => boolean;
}

const AnnouncementNotificationContext =
  createContext<AnnouncementNotificationContextType>({
    unreadCount: 0,
    markAllAsRead: () => {},
    latestId: 0,
    viewedIds: [],
    markAsViewed: () => {},
    isViewed: () => false,
  });

export const useAnnouncementNotification = () =>
  useContext(AnnouncementNotificationContext);

export default function AnnouncementNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("announcements");
  const router = useRouter();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [latestId, setLatestId] = useState<number>(0);
  const [viewedIds, setViewedIds] = useState<number[]>([]);

  const lastSeenIdRef = useRef<number>(0);
  const lastReadIdRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const lastTopIdsRef = useRef<number[]>([]);
  const viewedIdsSetRef = useRef<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  // Load viewed announcements from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("massinissa_viewed_announcement_ids");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const ids = parsed.map(Number).filter((n) => !isNaN(n));
          setViewedIds(ids);
          viewedIdsSetRef.current = new Set(ids);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const markAsViewed = useCallback((id: number) => {
    if (!id || viewedIdsSetRef.current.has(id)) return;

    viewedIdsSetRef.current.add(id);
    setViewedIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem(
          "massinissa_viewed_announcement_ids",
          JSON.stringify(next.slice(-200))
        );
      } catch {
        // Ignore
      }
      return next;
    });

    // Notify other tabs
    try {
      const bc = new BroadcastChannel("massinissa_announcements_channel");
      bc.postMessage({ type: "ANNOUNCEMENT_VIEWED", id });
      bc.close();
    } catch {
      // Ignore
    }
  }, []);

  const isViewed = useCallback(
    (id: number) => viewedIdsSetRef.current.has(id) || viewedIds.includes(id),
    [viewedIds]
  );

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
    const currentMax = Math.max(latestId, lastSeenIdRef.current);
    lastReadIdRef.current = currentMax;
    try {
      localStorage.setItem("massinissa_announcements_last_read_id", String(currentMax));
    } catch {
      // Ignore storage errors
    }
  }, [latestId]);

  // Check if current route is announcements list; if so, mark as read
  useEffect(() => {
    if (pathname.includes("/list/announcements")) {
      markAllAsRead();
    }
  }, [pathname, markAllAsRead]);

  const checkForNewAnnouncements = useCallback(async () => {
    try {
      const sinceId = lastSeenIdRef.current;
      const lastReadId = lastReadIdRef.current;

      const res = await fetch(
        `/api/announcements/check-new?sinceId=${sinceId}&lastReadId=${lastReadId}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;

      const data: {
        announcements: Array<{
          id: number;
          title: string;
          description: string;
          authorBranchName: string | null;
          targetBranchName: string | null;
        }>;
        unreadCount: number;
        latestId: number;
        topAnnouncementIds?: number[];
      } = await res.json();

      setLatestId(data.latestId);

      const currentTopIds = data.topAnnouncementIds || [];
      const topIdsChanged =
        isInitializedRef.current &&
        lastTopIdsRef.current.length > 0 &&
        (lastTopIdsRef.current.length !== currentTopIds.length ||
          lastTopIdsRef.current.some((id, idx) => id !== currentTopIds[idx]));

      // On first load, initialize without popping toasts
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        const currentSeen = Math.max(sinceId, data.latestId);
        lastSeenIdRef.current = currentSeen;
        lastTopIdsRef.current = currentTopIds;
        try {
          localStorage.setItem("massinissa_announcements_last_seen_id", String(currentSeen));
        } catch {
          // Ignore
        }
        setUnreadCount(data.unreadCount);
        return;
      }

      setUnreadCount(data.unreadCount);

      // If top visible announcements changed on dashboard, sync live
      if (topIdsChanged) {
        lastTopIdsRef.current = currentTopIds;
        startTransition(() => {
          router.refresh();
        });
      } else {
        lastTopIdsRef.current = currentTopIds;
      }

      // If new announcements arrived while app is open, fire pop-up notification toaster!
      if (data.announcements && data.announcements.length > 0) {
        data.announcements.forEach((item) => {
          const authorLabel = item.authorBranchName
            ? t("authorBranch", { branch: item.authorBranchName })
            : t("authorGeneral");
          const targetLabel = item.targetBranchName
            ? t("targetBranchBadge", { branch: item.targetBranchName })
            : t("targetAllBadge");

          toast(
            ({ closeToast }) => (
              <div
                className="relative flex items-start gap-3.5 p-3.5 cursor-pointer select-none group w-full text-start"
                onClick={() => {
                  router.push("/list/announcements");
                  closeToast();
                }}
                role="button"
                tabIndex={0}
              >
                {/* Icon pill with glowing animation dot */}
                <div className="relative shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm ring-2 ring-white">
                    <Megaphone className="w-5 h-5 text-white stroke-[2.2]" />
                  </div>
                  <span className="absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 border-2 border-white" />
                  </span>
                </div>

                {/* Content Area */}
                <div className="flex flex-col flex-1 min-w-0 pr-6 rtl:pr-0 rtl:pl-6">
                  {/* Category Pill */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200/80">
                      {t("newAnnouncementToastTitle")}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-[13.5px] font-bold text-gray-900 line-clamp-1 mt-1.5 group-hover:text-sky-600 transition-colors">
                    {item.title}
                  </h4>

                  {/* Snippet / Description if available */}
                  {item.description && (
                    <p className="text-[12px] text-gray-500 line-clamp-2 mt-0.5 leading-relaxed font-normal">
                      {item.description}
                    </p>
                  )}

                  {/* Metadata pills & Action link */}
                  <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-gray-100 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-50 text-slate-600 border border-slate-200/70">
                        {targetLabel}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-50 text-slate-500 border border-slate-200/70">
                        {authorLabel}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 group-hover:underline">
                      {t("clickToView")}
                      <ArrowRight className="w-3 h-3 rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </div>
            ),
            {
              theme: "light",
              icon: false,
              autoClose: 7000,
              className: "!p-0 !rounded-2xl !shadow-2xl !border !border-gray-200/90 !bg-white overflow-hidden !min-h-0",
              progressClassName: "toast-announcement-progress !bg-blue-600",
              closeButton: ({ closeToast }) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeToast(e);
                  }}
                  className="absolute top-3 right-3 rtl:right-auto rtl:left-3 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              ),
            }
          );
        });

        const newMaxSeen = Math.max(lastSeenIdRef.current, data.latestId);
        lastSeenIdRef.current = newMaxSeen;
        try {
          localStorage.setItem("massinissa_announcements_last_seen_id", String(newMaxSeen));
        } catch {
          // Ignore
        }

        // Seamlessly update server components on the active page (dashboard announcements panel)
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      // Fail silently on network errors
    }
  }, [t, router]);

  // Cross-tab immediate sync via BroadcastChannel
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("massinissa_announcements_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "ANNOUNCEMENT_CHANGED") {
          checkForNewAnnouncements();
          startTransition(() => {
            router.refresh();
          });
        } else if (event.data?.type === "ANNOUNCEMENT_VIEWED" && event.data.id) {
          const id = Number(event.data.id);
          if (!viewedIdsSetRef.current.has(id)) {
            viewedIdsSetRef.current.add(id);
            setViewedIds((prev) => Array.from(new Set([...prev, id])));
          }
        }
      };
    } catch {
      // Ignore
    }

    return () => {
      try {
        bc?.close();
      } catch {
        // Ignore
      }
    };
  }, [checkForNewAnnouncements, router]);

  // Initial load from localStorage
  useEffect(() => {
    try {
      const storedSeen = parseInt(
        localStorage.getItem("massinissa_announcements_last_seen_id") || "0",
        10
      );
      const storedRead = parseInt(
        localStorage.getItem("massinissa_announcements_last_read_id") || "0",
        10
      );
      if (storedSeen) lastSeenIdRef.current = storedSeen;
      if (storedRead) lastReadIdRef.current = storedRead;
    } catch {
      // Ignore
    }

    checkForNewAnnouncements();
  }, [checkForNewAnnouncements]);

  // Polling heartbeat every 10s + immediate check on window focus
  useEffect(() => {
    const interval = setInterval(() => {
      checkForNewAnnouncements();
    }, 10000);

    const onFocus = () => {
      checkForNewAnnouncements();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkForNewAnnouncements]);

  return (
    <AnnouncementNotificationContext.Provider
      value={{
        unreadCount,
        markAllAsRead,
        latestId,
        viewedIds,
        markAsViewed,
        isViewed,
      }}
    >
      {children}
    </AnnouncementNotificationContext.Provider>
  );
}
