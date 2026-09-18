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
  refreshAnnouncements: () => void;
}

const AnnouncementNotificationContext =
  createContext<AnnouncementNotificationContextType>({
    unreadCount: 0,
    markAllAsRead: () => {},
    latestId: 0,
    viewedIds: [],
    markAsViewed: () => {},
    isViewed: () => false,
    refreshAnnouncements: () => {},
  });

export const useAnnouncementNotification = () =>
  useContext(AnnouncementNotificationContext);

// Subtle Web Audio notification chime (two-tone pleasant chime)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // Autoplay policy might catch un-interacted audio context, silently continue
  }
}

function AnnouncementToastCard({
  item,
  authorLabel,
  targetLabel,
  badgeTitle,
  clickToViewLabel,
  onClick,
  closeToast,
}: {
  item: {
    id: number;
    title: string;
    description?: string;
  };
  authorLabel: string;
  targetLabel: string;
  badgeTitle: string;
  clickToViewLabel: string;
  onClick: () => void;
  closeToast?: () => void;
}) {
  return (
    <div
      className="relative flex items-start gap-3.5 p-3.5 cursor-pointer select-none group w-full text-start"
      onClick={() => {
        onClick();
        closeToast?.();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative shrink-0 mt-0.5">
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs ring-2 ring-white">
          <Megaphone className="w-5 h-5 text-white stroke-[2.2]" />
        </div>
        <span className="absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 border-2 border-white" />
        </span>
      </div>

      <div className="flex flex-col flex-1 min-w-0 pr-6 rtl:pr-0 rtl:pl-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200/80">
            {badgeTitle}
          </span>
        </div>

        <h4 className="text-[13.5px] font-bold text-gray-900 line-clamp-1 mt-1.5 group-hover:text-sky-600 transition-colors">
          {item.title}
        </h4>

        {item.description && (
          <p className="text-[12px] text-gray-500 line-clamp-2 mt-0.5 leading-relaxed font-normal">
            {item.description}
          </p>
        )}

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
            {clickToViewLabel}
            <ArrowRight className="w-3 h-3 rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

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

  const userIdRef = useRef<string | null>(null);
  const lastTopIdsRef = useRef<number[]>([]);
  const newAnnouncementIdsRef = useRef<number[]>([]);
  const viewedIdsSetRef = useRef<Set<number>>(new Set());
  const notifiedIdsSetRef = useRef<Set<number>>(new Set());
  const isFetchingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);
  const [, startTransition] = useTransition();

  // Load viewed announcements from localStorage
  const loadStoredDataForUser = useCallback((uid: string | null) => {
    userIdRef.current = uid;
    const u = uid || "guest";
    try {
      const storedViewed = localStorage.getItem(`massinissa_viewed_announcement_ids_${u}`);
      if (storedViewed) {
        const parsed = JSON.parse(storedViewed);
        if (Array.isArray(parsed)) {
          const ids = parsed.map(Number).filter((n) => !isNaN(n));
          setViewedIds(ids);
          viewedIdsSetRef.current = new Set(ids);
        }
      } else {
        const legacyViewed = localStorage.getItem("massinissa_viewed_announcement_ids");
        if (legacyViewed) {
          const parsed = JSON.parse(legacyViewed);
          if (Array.isArray(parsed)) {
            const ids = parsed.map(Number).filter((n) => !isNaN(n));
            setViewedIds(ids);
            viewedIdsSetRef.current = new Set(ids);
          }
        }
      }

      // Load session notified IDs so we don't repeat notifications within session
      const storedNotified = sessionStorage.getItem(`massinissa_notified_ids_${u}`);
      if (storedNotified) {
        const parsed = JSON.parse(storedNotified);
        if (Array.isArray(parsed)) {
          notifiedIdsSetRef.current = new Set(parsed.map(Number));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadStoredDataForUser(null);
  }, [loadStoredDataForUser]);

  const markAsViewed = useCallback((id: number) => {
    if (!id || viewedIdsSetRef.current.has(id)) return;

    viewedIdsSetRef.current.add(id);
    setViewedIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        const u = userIdRef.current || "guest";
        localStorage.setItem(
          `massinissa_viewed_announcement_ids_${u}`,
          JSON.stringify(next.slice(-200))
        );
      } catch {
        // Ignore
      }
      return next;
    });

    // Synchronously reduce unreadCount immediately for real-time badge feedback
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // Notify other tabs and local windows
    try {
      const bc = new BroadcastChannel("massinissa_announcements_channel");
      bc.postMessage({ type: "ANNOUNCEMENT_VIEWED", id });
      bc.close();
    } catch {
      // Ignore
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("massinissa:announcement_viewed", { detail: { id } })
      );
    }
  }, []);

  const isViewed = useCallback(
    (id: number) => viewedIdsSetRef.current.has(id) || viewedIds.includes(id),
    [viewedIds]
  );

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
    const idsToMark = newAnnouncementIdsRef.current;
    if (idsToMark.length > 0) {
      idsToMark.forEach((id) => {
        viewedIdsSetRef.current.add(id);
      });
      setViewedIds((prev) => {
        const next = Array.from(new Set([...prev, ...idsToMark]));
        try {
          const u = userIdRef.current || "guest";
          localStorage.setItem(
            `massinissa_viewed_announcement_ids_${u}`,
            JSON.stringify(next.slice(-200))
          );
        } catch {
          // Ignore
        }
        return next;
      });
    }
  }, []);

  // Check if current route is announcements list; if so, mark all as read
  useEffect(() => {
    if (pathname.includes("/list/announcements")) {
      markAllAsRead();
    }
  }, [pathname, markAllAsRead]);

  const checkForNewAnnouncements = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const res = await fetch(`/api/announcements/check-new?_t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!res.ok) return;

      const data: {
        recentNewAnnouncements: Array<{
          id: number;
          title: string;
          description: string;
          authorBranchName: string | null;
          targetBranchName: string | null;
        }>;
        newAnnouncementIds: number[];
        topAnnouncementIds: number[];
        unreadCount: number;
        latestId: number;
        userId?: string | null;
      } = await res.json();

      if (data.userId && data.userId !== userIdRef.current) {
        loadStoredDataForUser(data.userId);
      }

      setLatestId(data.latestId || 0);

      const newIds = data.newAnnouncementIds || [];
      newAnnouncementIdsRef.current = newIds;

      const currentTopIds = data.topAnnouncementIds || [];
      const topIdsChanged =
        lastTopIdsRef.current.length > 0 &&
        (lastTopIdsRef.current.length !== currentTopIds.length ||
          lastTopIdsRef.current.some((id, idx) => id !== currentTopIds[idx]));

      // Unread count: exactly how many recent (last 72h) announcements haven't been viewed yet
      const isOnAnnouncementsPage = pathname.includes("/list/announcements");
      if (isOnAnnouncementsPage) {
        setUnreadCount(0);
      } else {
        const computedUnread = newIds.filter(
          (id) => !viewedIdsSetRef.current.has(id)
        ).length;
        setUnreadCount(computedUnread);
      }

      // Check for unviewed announcements that haven't been toasted in this session yet
      const unnotifiedItems = (data.recentNewAnnouncements || []).filter(
        (item) =>
          !viewedIdsSetRef.current.has(item.id) &&
          !notifiedIdsSetRef.current.has(item.id)
      );

      if (unnotifiedItems.length > 0) {
        playNotificationChime();

        // Toast the latest unviewed items (capped to 3 so user is not spammed)
        unnotifiedItems.slice(0, 3).forEach((item) => {
          notifiedIdsSetRef.current.add(item.id);

          const authorLabel = item.authorBranchName
            ? t("authorBranch", { branch: item.authorBranchName })
            : t("authorGeneral");
          const targetLabel = item.targetBranchName
            ? t("targetBranchBadge", { branch: item.targetBranchName })
            : t("targetAllBadge");

          toast(
            <AnnouncementToastCard
              item={item}
              authorLabel={authorLabel}
              targetLabel={targetLabel}
              badgeTitle={t("newAnnouncementToastTitle")}
              clickToViewLabel={t("clickToView")}
              onClick={() => router.push("/list/announcements")}
            />,
            {
              toastId: `announcement_${item.id}`,
              theme: "light",
              icon: false,
              autoClose: 7000,
              className:
                "!p-0 !rounded-2xl !shadow-2xl !border !border-gray-200/90 !bg-white overflow-hidden !min-h-0",
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

        // Persist session notified IDs
        try {
          const u = userIdRef.current || "guest";
          sessionStorage.setItem(
            `massinissa_notified_ids_${u}`,
            JSON.stringify(Array.from(notifiedIdsSetRef.current))
          );
        } catch {
          // Ignore
        }
      }

      // If top announcements changed while user is viewing the page, refresh server components
      if (topIdsChanged) {
        lastTopIdsRef.current = currentTopIds;
        startTransition(() => {
          router.refresh();
        });
      } else {
        lastTopIdsRef.current = currentTopIds;
      }
    } catch {
      // Fail silently on network errors
    } finally {
      isFetchingRef.current = false;
    }
  }, [t, router, pathname, loadStoredDataForUser]);

  // Cross-tab and window event listener for immediate sync
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
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      };
    } catch {
      // Ignore
    }

    const onCustomChanged = () => {
      checkForNewAnnouncements();
      startTransition(() => {
        router.refresh();
      });
    };

    const onCustomViewed = (e: any) => {
      const id = Number(e.detail?.id);
      if (id && !viewedIdsSetRef.current.has(id)) {
        viewedIdsSetRef.current.add(id);
        setViewedIds((prev) => Array.from(new Set([...prev, id])));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    };

    window.addEventListener("massinissa:announcements_updated", onCustomChanged);
    window.addEventListener("massinissa:announcement_viewed", onCustomViewed);

    return () => {
      try {
        bc?.close();
      } catch {
        // Ignore
      }
      window.removeEventListener("massinissa:announcements_updated", onCustomChanged);
      window.removeEventListener("massinissa:announcement_viewed", onCustomViewed);
    };
  }, [checkForNewAnnouncements, router]);

  // Initial check on mount
  useEffect(() => {
    checkForNewAnnouncements();
  }, [checkForNewAnnouncements]);

  // Real-time Heartbeat:
  // - 3.5s when page is active/visible
  // - 15s when backgrounded
  // - Instant on focus, visibility change, online
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startHeartbeat = () => {
      if (interval) clearInterval(interval);
      const delay = document.visibilityState === "visible" ? 3500 : 15000;
      interval = setInterval(() => {
        checkForNewAnnouncements();
      }, delay);
    };

    startHeartbeat();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForNewAnnouncements();
      }
      startHeartbeat();
    };

    const onFocus = () => {
      checkForNewAnnouncements();
    };

    const onOnline = () => {
      checkForNewAnnouncements();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
        refreshAnnouncements: checkForNewAnnouncements,
      }}
    >
      {children}
    </AnnouncementNotificationContext.Provider>
  );
}

