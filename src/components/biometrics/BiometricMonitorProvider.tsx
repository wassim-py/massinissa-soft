"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { toast } from "react-toastify";
import {
  Fingerprint,
  X,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  UserCheck,
  Search,
  Volume2,
  VolumeX,
  ExternalLink,
  User,
  BookOpen,
  DoorOpen,
  Calendar,
  HelpCircle,
  Info,
  Trash2,
  ChevronUp,
} from "lucide-react";
import {
  BiometricScanResult,
  resolveBiometricAlertAction,
  clearBiometricJournalAction,
  getBiometricCatchUpOptionsAction,
  recordBiometricCatchUpAction,
} from "@/lib/biometricActions";

interface BiometricMonitorContextType {
  isEnabled: boolean;
  setIsEnabled: (val: boolean) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (val: boolean) => void;
  recentScans: BiometricScanResult[];
  pinnedAlerts: BiometricScanResult[];
  liveStreamCard: BiometricScanResult | null;
  deviceConnected: boolean;
  handleResolveAlert: (
    scanId: number,
    mode: "DISMISS" | "ALLOW_PRESENT" | "RESOLVED_BY_PAYMENT" | "RESOLVED_BY_CATCHUP"
  ) => Promise<void>;
  handleClearJournal: () => Promise<void>;
  handleSyncK50Devices: () => Promise<void>;
  isSyncingK50: boolean;
  openCatchUpModalForScan: (scan: BiometricScanResult) => void;
}

const BiometricMonitorContext = createContext<BiometricMonitorContextType>({
  isEnabled: true,
  setIsEnabled: () => {},
  isMuted: false,
  setIsMuted: () => {},
  isDrawerOpen: false,
  setIsDrawerOpen: () => {},
  recentScans: [],
  pinnedAlerts: [],
  liveStreamCard: null,
  deviceConnected: false,
  isSyncingK50: false,
  handleResolveAlert: async () => {},
  handleClearJournal: async () => {},
  handleSyncK50Devices: async () => {},
  openCatchUpModalForScan: () => {},
});

export const useBiometricMonitor = () => useContext(BiometricMonitorContext);

/**
 * Real CSS-Animated Status Circle Indicator (Replaces emoji circles)
 */
function BiometricStatusDot({
  variant,
  size = "md",
}: {
  variant: "success" | "danger" | "green-red" | "red-green" | "offline";
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  if (variant === "success") {
    return (
      <span className={`relative inline-flex ${dim} shrink-0`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className={`relative inline-flex rounded-full ${dim} bg-emerald-500`} />
      </span>
    );
  }

  if (variant === "danger") {
    return (
      <span className={`relative inline-flex ${dim} shrink-0`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className={`relative inline-flex rounded-full ${dim} bg-red-600`} />
      </span>
    );
  }

  if (variant === "green-red") {
    return (
      <span
        className={`relative inline-flex rounded-full ${dim} shrink-0 biometric-dot-green-red`}
      />
    );
  }

  if (variant === "red-green") {
    return (
      <span
        className={`relative inline-flex rounded-full ${dim} shrink-0 biometric-dot-red-green`}
      />
    );
  }

  return (
    <span className={`relative inline-flex rounded-full ${dim} bg-gray-400 shrink-0`} />
  );
}

// 4 Distinct Web Audio API Sound Effects for the 4 Biometric States
function playBiometricTone(
  type: "SUCCESS" | "NO_CREDITS" | "NO_UPCOMING_GROUP" | "UNRECOGNIZED"
) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "SUCCESS") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.1);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "NO_CREDITS") {
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(310, now + i * 0.18);
        gain.gain.setValueAtTime(0.2, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.14);
      }
    } else if (type === "NO_UPCOMING_GROUP") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(190, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export default function BiometricMonitorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();

  // Detect if the admin currently has a specific lesson's Attendance Taking page open (/list/attendance/take/[lessonId])
  const openLessonId = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/\/list\/attendance\/take\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [pathname]);

  const [isEnabled, setIsEnabledState] = useState<boolean>(true);
  const [isMuted, setIsMutedState] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [recentScans, setRecentScans] = useState<BiometricScanResult[]>([]);
  const [pinnedAlerts, setPinnedAlerts] = useState<BiometricScanResult[]>([]);
  const [liveStreamCard, setLiveStreamCard] = useState<BiometricScanResult | null>(null);
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [isHoveringActionZone, setIsHoveringActionZone] = useState<boolean>(false);
  const [showAllPinnedInHud, setShowAllPinnedInHud] = useState<boolean>(false);

  // Drawer filter & search state
  const [drawerTab, setDrawerTab] = useState<
    "ALL" | "NO_CREDITS" | "NO_UPCOMING_GROUP" | "SUCCESS"
  >("ALL");
  const [drawerSearch, setDrawerSearch] = useState<string>("");
  const [deviceEndpoint, setDeviceEndpoint] = useState<string>("192.168.50.201:4370");

  // Catch-up (Rattrapage) Modal state for State 3 cards
  const [catchUpTargetScan, setCatchUpTargetScan] =
    useState<BiometricScanResult | null>(null);
  const [catchUpOptions, setCatchUpOptions] = useState<{
    loading: boolean;
    activeBranchLessons: Array<{
      id: number;
      classId: number;
      className: string;
      teacherName: string;
      classroomName: string;
      startsAt: string;
      endsAt: string;
    }>;
    uncaughtMissedLessons: Array<{
      lessonId: number;
      className: string;
      teacherName: string;
      startsAt: string;
    }>;
  }>({
    loading: false,
    activeBranchLessons: [],
    uncaughtMissedLessons: [],
  });
  const [selectedMissedLessonId, setSelectedMissedLessonId] = useState<string>("");
  const [selectedCatchUpLessonId, setSelectedCatchUpLessonId] = useState<string>("");
  const [isSavingCatchUp, setIsSavingCatchUp] = useState<boolean>(false);

  const lastSeenIdRef = useRef<number>(0);
  const currentBranchIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef<boolean>(false);
  const liveCardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMutedRef = useRef<boolean>(false);

  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem("massinissa_biometric_enabled");
      if (savedEnabled !== null) {
        setIsEnabledState(savedEnabled === "true");
      }
      const savedMuted = localStorage.getItem("massinissa_biometric_muted");
      if (savedMuted !== null) {
        const m = savedMuted === "true";
        setIsMutedState(m);
        isMutedRef.current = m;
      }
    } catch {
      // ignore
    }
  }, []);

  const setIsEnabled = useCallback((val: boolean) => {
    setIsEnabledState(val);
    try {
      localStorage.setItem("massinissa_biometric_enabled", String(val));
    } catch {
      // ignore
    }
    if (!val) {
      setLiveStreamCard(null);
    } else if (typeof window !== "undefined") {
      // Force an immediate fresh K50 Pro hardware handshake when toggled ON
      fetch("http://127.0.0.1:4375/status?forceReconnect=1", {
        cache: "no-store",
      }).catch(() => {});
    }
  }, []);

  const setIsMuted = useCallback((val: boolean) => {
    setIsMutedState(val);
    isMutedRef.current = val;
    try {
      localStorage.setItem("massinissa_biometric_muted", String(val));
    } catch {
      // ignore
    }
  }, []);

  // Process incoming scan into the Two-Zone Split HUD
  const announceIncomingScan = useCallback(
    (scan: BiometricScanResult) => {
      if (!isMutedRef.current) {
        playBiometricTone(
          scan.status === "NO_CREDITS"
            ? "NO_CREDITS"
            : scan.status === "NO_UPCOMING_GROUP"
            ? "NO_UPCOMING_GROUP"
            : scan.status === "UNRECOGNIZED"
            ? "UNRECOGNIZED"
            : "SUCCESS"
        );
      }

      // Dispatch live event for AttendanceRoster.tsx auto-highlighting (§7.5)
      if (scan.status === "SUCCESS" && scan.studentId && scan.lessonId) {
        window.dispatchEvent(
          new CustomEvent("biometric-attendance-marked", {
            detail: scan,
          })
        );
        if (openLessonId && Number(scan.lessonId) === Number(openLessonId)) {
          router.refresh();
        }
      }

      // Zone B (Upper Pinned Action Zone): State 2 (NO_CREDITS) & State 3 (NO_UPCOMING_GROUP)
      if (
        (scan.status === "NO_CREDITS" || scan.status === "NO_UPCOMING_GROUP") &&
        !scan.isResolved
      ) {
        setPinnedAlerts((prev) => {
          const filtered = prev.filter(
            (p) => p.id !== scan.id && p.studentId !== scan.studentId
          );
          return [scan, ...filtered];
        });
        return;
      }

      // Zone A (Lower Live Passing Stream): State 1 (SUCCESS) & State 4 (UNRECOGNIZED)
      setLiveStreamCard(scan);
      if (liveCardTimeoutRef.current) {
        clearTimeout(liveCardTimeoutRef.current);
      }
      const duration = scan.status === "UNRECOGNIZED" ? 4500 : 3800;
      liveCardTimeoutRef.current = setTimeout(() => {
        setLiveStreamCard((curr) => (curr?.id === scan.id ? null : curr));
      }, duration);
    },
    [openLessonId, router]
  );

  const isPollingRef = useRef<boolean>(false);
  const lastLocalBridgeFailAtRef = useRef<number>(0);
  const localSseConnectedRef = useRef<boolean>(false);
  const openLessonIdRef = useRef<number | null>(openLessonId);
  useEffect(() => {
    openLessonIdRef.current = openLessonId;
  }, [openLessonId]);

  // Immediately ingests a BiometricScanResult returned directly from POST /api/biometrics/scan (0ms UI update!)
  const ingestDirectScanResult = useCallback(
    (scan: BiometricScanResult) => {
      if (!scan || !scan.id) return;
      if (scan.id > lastSeenIdRef.current) {
        lastSeenIdRef.current = scan.id;
      }
      setRecentScans((prev) => {
        const filtered = prev.filter((p) => {
          if (p.id === scan.id) return false;
          if (scan.status === "UNRECOGNIZED" && p.status === "UNRECOGNIZED") {
            return false;
          }
          if (
            scan.status === "SUCCESS" &&
            p.status === "SUCCESS" &&
            p.studentId === scan.studentId &&
            p.lessonId === scan.lessonId
          ) {
            return false;
          }
          return true;
        });
        return [scan, ...filtered].slice(0, 100);
      });

      if (scan.status === "SUCCESS" && scan.studentId && scan.lessonId) {
        setPinnedAlerts((prev) =>
          prev.filter(
            (a) =>
              !(
                a.studentId === scan.studentId &&
                a.lessonId === scan.lessonId &&
                a.status === "NO_CREDITS"
              )
          )
        );
      }

      announceIncomingScan(scan);
    },
    [announceIncomingScan]
  );

  // Instant 0ms Local Bridge SSE stream (http://127.0.0.1:4375/events) for Online Cloud Deployment
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    let es: EventSource | null = null;
    let retryTimer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const connectLocalSse = () => {
      if (isCancelled) return;
      try {
        es = new EventSource("http://127.0.0.1:4375/events");

        es.onopen = () => {
          localSseConnectedRef.current = true;
          lastLocalBridgeFailAtRef.current = 0;
        };

        es.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data || "{}");
            if (msg.type === "status") {
              setDeviceConnected(Boolean(msg.connected));
              if (msg.deviceIp) {
                setDeviceEndpoint(`${msg.deviceIp}:4370`);
              }
              return;
            }

            if (msg.type === "scan") {
              // Instant scan event received in <2ms from K50 Pro via Local Bridge!
              // Post directly to /api/biometrics/scan and render the popup immediately from the response
              const branchId = currentBranchIdRef.current || 1;
              const res = await fetch("/api/biometrics/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  globalNumber: msg.globalNumber ?? null,
                  isUnrecognizedFinger: Boolean(msg.isUnrecognizedFinger),
                  branchId,
                  openLessonId: openLessonIdRef.current || null,
                }),
              });
              if (res.ok) {
                const resData = await res.json();
                if (resData?.success && resData.scan) {
                  ingestDirectScanResult(resData.scan);
                  // Self-heal deleted student from K50 Pro flash memory
                  if (
                    resData.scan.status === "UNRECOGNIZED" &&
                    msg.globalNumber &&
                    Number(msg.globalNumber) > 0
                  ) {
                    fetch(
                      `http://127.0.0.1:4375/enroll?mode=delete&globalNumber=${Number(
                        msg.globalNumber
                      )}`,
                      { method: "DELETE" }
                    ).catch(() => {});
                  }
                }
              }
            }
          } catch {
            // Ignore malformed SSE message
          }
        };

        es.onerror = () => {
          localSseConnectedRef.current = false;
          if (es) {
            es.close();
            es = null;
          }
          if (!isCancelled) {
            retryTimer = setTimeout(connectLocalSse, 15000);
          }
        };
      } catch {
        localSseConnectedRef.current = false;
      }
    };

    connectLocalSse();

    return () => {
      isCancelled = true;
      localSseConnectedRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [isEnabled, ingestDirectScanResult]);

  // Background polling loop when isEnabled === true (pauses when tab is hidden)
  useEffect(() => {
    if (!isEnabled) return;

    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const pollFeed = async () => {
      if (isPollingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      isPollingRef.current = true;

      try {
        const lessonQuery = openLessonId ? `&openLessonId=${openLessonId}` : "";
        const bridgeQuery = localSseConnectedRef.current ? "&bridgeActive=1" : "";
        const res = await fetch(
          `/api/biometrics/scan?sinceId=${lastSeenIdRef.current}${lessonQuery}${bridgeQuery}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data.success) return;

        // Check live K50 Pro TCP status (either direct localhost server or School PC Local Bridge at 127.0.0.1:4375)
        const nowMs = Date.now();
        let anyOnline = Boolean(data.hardwareConnected);

        if (data.deviceIp) {
          setDeviceEndpoint(`${data.deviceIp}:${data.devicePort || 4370}`);
        }

        // Sync context with School PC Local Bridge (http://127.0.0.1:4375)
        if (
          typeof window !== "undefined" &&
          (localSseConnectedRef.current ||
            (!data.hardwareConnected &&
              nowMs - lastLocalBridgeFailAtRef.current > 15000))
        ) {
          try {
            const bridgeUrl = `http://127.0.0.1:4375/status?appUrl=${encodeURIComponent(
              window.location.origin
            )}&branchId=${data.branchId || 1}&openLessonId=${openLessonId || ""}`;
            const bridgeRes = await fetch(bridgeUrl, { cache: "no-store" });
            if (bridgeRes.ok) {
              lastLocalBridgeFailAtRef.current = 0;
              const bridgeData = await bridgeRes.json();
              // Authoritative live hardware state from the local PC bridge
              anyOnline = Boolean(bridgeData.connected);
              if (bridgeData.deviceIp) {
                setDeviceEndpoint(
                  `${bridgeData.deviceIp}:${bridgeData.devicePort || 4370}`
                );
              }
              // If the local bridge queued any fallback scan events, process and render them immediately
              if (
                Array.isArray(bridgeData.pendingScans) &&
                bridgeData.pendingScans.length > 0
              ) {
                for (const ev of bridgeData.pendingScans) {
                  const postRes = await fetch("/api/biometrics/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...ev,
                      branchId: data.branchId || 1,
                      openLessonId: openLessonId || null,
                    }),
                  });
                  if (postRes.ok) {
                    const postData = await postRes.json();
                    if (postData?.success && postData.scan) {
                      ingestDirectScanResult(postData.scan);
                    }
                  }
                }
              }
            } else {
              lastLocalBridgeFailAtRef.current = nowMs;
            }
          } catch {
            // Local bridge not running on 127.0.0.1:4375 — wait 15s before retrying
            lastLocalBridgeFailAtRef.current = nowMs;
          }
        }

        setDeviceConnected(anyOnline);

        // If the admin switched branches in the UI, re-initialize the feed for the new branch
        if (
          currentBranchIdRef.current !== null &&
          data.branchId &&
          currentBranchIdRef.current !== Number(data.branchId)
        ) {
          currentBranchIdRef.current = Number(data.branchId);
          isInitializedRef.current = false;
          lastSeenIdRef.current = 0;
          setLiveStreamCard(null);
        }

        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
          currentBranchIdRef.current = data.branchId
            ? Number(data.branchId)
            : 1;
          const scans: BiometricScanResult[] = data.recentScans || [];
          setRecentScans(scans);
          setPinnedAlerts(data.pinnedAlerts || []);
          if (scans.length > 0) {
            lastSeenIdRef.current = Math.max(...scans.map((s) => s.id));
          }
          return;
        }

        // Subsequent polls: detect newly arrived scans
        const newScans: BiometricScanResult[] = data.recentScans || [];
        if (newScans.length > 0) {
          const maxId = Math.max(...newScans.map((s) => s.id));
          if (maxId > lastSeenIdRef.current) {
            lastSeenIdRef.current = maxId;
          }
          setRecentScans((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNew = newScans.filter((s) => !existingIds.has(s.id));
            const hasNewUnrecognized = uniqueNew.some(
              (s) => s.status === "UNRECOGNIZED"
            );
            const basePrev = hasNewUnrecognized
              ? prev.filter((p) => p.status !== "UNRECOGNIZED")
              : prev;
            return [...uniqueNew, ...basePrev].slice(0, 100);
          });

          const chronological = [...newScans].sort((a, b) => a.id - b.id);
          for (const scan of chronological) {
            announceIncomingScan(scan);
          }
        }

        if (!isHoveringActionZone && data.pinnedAlerts) {
          setPinnedAlerts(data.pinnedAlerts);
        }
      } catch {
        // Silently retry on next interval
      } finally {
        isPollingRef.current = false;
      }
    };

    const startPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      // When Local Bridge SSE (127.0.0.1:4375/events) is active, scans arrive in <2ms via SSE,
      // so background cloud polling can run gently every 12s to save NeonDB quota!
      const pollIntervalMs = localSseConnectedRef.current
        ? 12000
        : openLessonId || isDrawerOpen
        ? 2000
        : 4500;
      interval = setInterval(pollFeed, pollIntervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollFeed();
      }
      startPolling();
    };

    const onFocus = () => {
      pollFeed();
    };

    pollFeed();
    startPolling();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [isEnabled, announceIncomingScan, ingestDirectScanResult, isHoveringActionZone, openLessonId, isDrawerOpen]);

  // Resolve or dismiss a pinned alert or journal entry
  const handleResolveAlert = useCallback(
    async (
      scanId: number,
      mode: "DISMISS" | "ALLOW_PRESENT" | "RESOLVED_BY_PAYMENT" | "RESOLVED_BY_CATCHUP"
    ) => {
      const targetAlert =
        pinnedAlerts.find((a) => a.id === scanId) ||
        recentScans.find((s) => s.id === scanId);

      setPinnedAlerts((prev) => prev.filter((a) => a.id !== scanId));
      if (mode === "DISMISS") {
        setRecentScans((prev) => prev.filter((s) => s.id !== scanId));
      } else {
        setRecentScans((prev) =>
          prev.map((s) =>
            s.id === scanId
              ? {
                  ...s,
                  isResolved: true,
                  status:
                    mode === "ALLOW_PRESENT" || mode === "RESOLVED_BY_PAYMENT"
                      ? "SUCCESS"
                      : s.status,
                }
              : s
          )
        );
      }

      const res = await resolveBiometricAlertAction({ scanId, mode });
      if (res.success && mode === "ALLOW_PRESENT") {
        toast.success(res.message);
        if (targetAlert && targetAlert.studentId && targetAlert.lessonId) {
          window.dispatchEvent(
            new CustomEvent("biometric-attendance-marked", {
              detail: { ...targetAlert, status: "SUCCESS" },
            })
          );
          if (
            openLessonId &&
            Number(targetAlert.lessonId) === Number(openLessonId)
          ) {
            router.refresh();
          }
        }
      }
    },
    [pinnedAlerts, recentScans, openLessonId, router]
  );

  // Clear the entire journal with 1 click so nothing stays stuck
  const handleClearJournal = useCallback(async () => {
    setRecentScans([]);
    setPinnedAlerts([]);
    setLiveStreamCard(null);
    const res = await clearBiometricJournalAction({ onlyResolved: false });
    if (res.success) {
      toast.info(
        isAr ? "تم مسح السجل بنجاح" : "Journal vidé avec succès"
      );
    }
  }, [isAr]);

  const [isSyncingK50, setIsSyncingK50] = useState<boolean>(false);

  // One-click multi-branch K50 biometric sync via local bridge
  const handleSyncK50Devices = useCallback(async () => {
    setIsSyncingK50(true);
    try {
      const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `http://127.0.0.1:4375/sync?appUrl=${encodeURIComponent(appOrigin)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) {
        toast.success(
          isAr
            ? `تمت مزامنة قارئ البصمة بنجاح (${data.syncedCount || 0} تلميذ محدث)!`
            : `Lecteur K50 synchronisé avec succès (${data.syncedCount || 0} empreintes mises à jour) !`
        );
      } else {
        toast.info(
          data.message ||
            (isAr ? "القارئ متزامن بالفعل مع السيرفر." : "Lecteur déjà à jour.")
        );
      }
    } catch {
      toast.error(
        isAr
          ? "تعذر الاتصال ببرنامج الجسر المحلي (127.0.0.1:4375)."
          : "Impossible de joindre le pont local (127.0.0.1:4375). Vérifiez qu'il est bien démarré."
      );
    } finally {
      setIsSyncingK50(false);
    }
  }, [isAr]);

  // Open Catch-Up (Rattrapage) modal for a State 3 card
  const openCatchUpModalForScan = useCallback(async (scan: BiometricScanResult) => {
    if (!scan.studentId) return;
    setCatchUpTargetScan(scan);
    setSelectedMissedLessonId("");
    setSelectedCatchUpLessonId("");
    setCatchUpOptions({
      loading: true,
      activeBranchLessons: [],
      uncaughtMissedLessons: [],
    });

    const res = await getBiometricCatchUpOptionsAction(scan.studentId, scan.branchId);
    if (res.success) {
      setCatchUpOptions({
        loading: false,
        activeBranchLessons: res.activeBranchLessons,
        uncaughtMissedLessons: res.uncaughtMissedLessons,
      });
      if (res.uncaughtMissedLessons.length > 0) {
        setSelectedMissedLessonId(String(res.uncaughtMissedLessons[0].lessonId));
      }
      if (res.activeBranchLessons.length > 0) {
        setSelectedCatchUpLessonId(String(res.activeBranchLessons[0].id));
      }
    } else {
      setCatchUpOptions({
        loading: false,
        activeBranchLessons: [],
        uncaughtMissedLessons: [],
      });
    }
  }, []);

  const handleSaveCatchUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !catchUpTargetScan?.studentId ||
      !selectedMissedLessonId ||
      !selectedCatchUpLessonId
    ) {
      return;
    }
    setIsSavingCatchUp(true);
    try {
      const res = await recordBiometricCatchUpAction({
        scanId: catchUpTargetScan.id,
        studentId: catchUpTargetScan.studentId,
        missedLessonId: Number(selectedMissedLessonId),
        catchUpLessonId: Number(selectedCatchUpLessonId),
      });
      if (res.success) {
        toast.success(res.message);
        setPinnedAlerts((prev) =>
          prev.filter((a) => a.id !== catchUpTargetScan.id)
        );
        setRecentScans((prev) =>
          prev.map((s) =>
            s.id === catchUpTargetScan.id
              ? { ...s, isResolved: true, status: "SUCCESS" }
              : s
          )
        );
        setCatchUpTargetScan(null);
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsSavingCatchUp(false);
    }
  };

  // Filtered scans for the Drawer
  const filteredDrawerScans = useMemo(() => {
    return recentScans.filter((s) => {
      if (drawerTab !== "ALL" && s.status !== drawerTab) return false;
      if (drawerSearch.trim()) {
        const q = drawerSearch.trim().toLowerCase();
        const matchName = s.studentName?.toLowerCase().includes(q);
        const matchNum =
          s.globalNumber !== null && String(s.globalNumber).includes(q);
        const matchClass = s.className?.toLowerCase().includes(q);
        return Boolean(matchName || matchNum || matchClass);
      }
      return true;
    });
  }, [recentScans, drawerTab, drawerSearch]);

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    });
  };

  const formatShortTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    });
  };

  const visiblePinnedAlerts = showAllPinnedInHud
    ? pinnedAlerts.slice(0, 5)
    : pinnedAlerts.slice(0, 2);
  const hiddenPinnedCount = Math.max(
    0,
    pinnedAlerts.length - visiblePinnedAlerts.length
  );

  return (
    <BiometricMonitorContext.Provider
      value={{
        isEnabled,
        setIsEnabled,
        isMuted,
        setIsMuted,
        isDrawerOpen,
        setIsDrawerOpen,
        recentScans,
        pinnedAlerts,
        liveStreamCard,
        deviceConnected,
        isSyncingK50,
        handleResolveAlert,
        handleClearJournal,
        handleSyncK50Devices,
        openCatchUpModalForScan,
      }}
    >
      {children}

      {/* ===================================================================== */}
      {/* §7.2 TWO-ZONE FLOATING LIVE SCAN HUD (MATCHES APPLICATION LIGHT UI)   */}
      {/* ===================================================================== */}
      {isEnabled && (pinnedAlerts.length > 0 || liveStreamCard) && (
        <div
          dir={isAr ? "rtl" : "ltr"}
          className={`fixed bottom-4 z-50 flex flex-col gap-2.5 w-[360px] sm:w-[390px] max-w-[calc(100vw-1.5rem)] pointer-events-none ${
            isAr ? "left-4" : "right-4"
          }`}
        >
          {/* ----------------------------------------------------------------- */}
          {/* ZONE B (UPPER PINNED ACTION ZONE): State 2 (NO_CREDITS) & State 3 */}
          {/* ----------------------------------------------------------------- */}
          {pinnedAlerts.length > 0 && (
            <div
              onMouseEnter={() => setIsHoveringActionZone(true)}
              onMouseLeave={() => setIsHoveringActionZone(false)}
              className="flex flex-col gap-2 pointer-events-auto"
            >
              {/* Overflow Pill when > 2 alerts are queued */}
              {hiddenPinnedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPinnedInHud(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center justify-between shadow-sm border border-gray-200 cursor-pointer transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                    <span>
                      {isAr
                        ? `+${hiddenPinnedCount} تنبيهات أخرى قيد الانتظار`
                        : `+${hiddenPinnedCount} autre(s) alerte(s) en attente`}
                    </span>
                  </span>
                  <span className="text-blue-600 font-semibold">
                    {isAr ? "عرض الكل" : "Voir tout"}
                  </span>
                </button>
              )}

              {visiblePinnedAlerts.map((alert) => {
                if (alert.status === "NO_CREDITS") {
                  // STATE 2: LIGHT APPLICATION CARD WITH RED ACCENT (0 CREDITS LEFT)
                  return (
                    <div
                      key={alert.id}
                      className="rounded-xl bg-white text-gray-800 border border-red-200 border-s-4 border-s-red-500 shadow-lg p-3.5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <BiometricStatusDot variant="danger" />
                          <span className="text-xs font-semibold text-red-700">
                            {isAr
                              ? "تنبيه : الرصيد منتهي (0 حصص)"
                              : "Solde épuisé (0 séance)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[11px] font-mono text-gray-400"
                            dir="ltr"
                          >
                            {formatTime(alert.scannedAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleResolveAlert(alert.id, "DISMISS")
                            }
                            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                            title={isAr ? "إغلاق" : "Fermer"}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{alert.studentName}</span>
                          <span className="text-gray-500 font-mono text-xs">
                            (#{alert.globalNumber})
                          </span>
                        </div>
                        <div className="text-gray-600 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-800">
                              {alert.className}
                            </span>
                          </span>
                          {alert.classroomName && (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <DoorOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>{alert.classroomName}</span>
                            </span>
                          )}
                          {alert.lessonStartsAt && (
                            <span className="font-mono text-gray-500" dir="ltr">
                              ({formatShortTime(alert.lessonStartsAt)} -{" "}
                              {formatShortTime(alert.lessonEndsAt)})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-red-700 bg-red-50/80 border border-red-100 rounded-md px-2.5 py-1.5 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>
                            {isAr
                              ? "لم يتبق أي رصيد حصص مدفوع لهذا التلميذ."
                              : "Aucune séance payée restante dans le cycle."}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => {
                            if (alert.studentId) {
                              router.push(`/list/students/${alert.studentId}`);
                            }
                          }}
                          className="flex-1 py-1.5 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>
                            {isAr ? "تسديد الآن" : "Encaisser maintenant"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleResolveAlert(alert.id, "ALLOW_PRESENT")
                          }
                          className="py-1.5 px-3 rounded-md bg-white hover:bg-gray-50 text-gray-700 font-medium text-xs flex items-center justify-center gap-1.5 border border-gray-300 cursor-pointer transition-colors"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-gray-600" />
                          <span>
                            {isAr ? "سماح استثنائي" : "Autoriser présence"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // STATE 3: SMOOTH FLASHING GREEN <-> RED LIGHT CARD (NO_UPCOMING_GROUP / RATTRAPAGE)
                return (
                  <div
                    key={alert.id}
                    className="rounded-xl bg-white text-gray-800 border-2 biometric-flash-green-red shadow-lg p-3.5 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <BiometricStatusDot variant="green-red" />
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase border biometric-badge-green-red">
                          {isAr ? "خارج التوقيت" : "Hors créneau"}
                        </span>
                        <span className="text-xs font-semibold text-gray-800">
                          {isAr
                            ? "لا توجد حصة مبرمجة الآن"
                            : "Aucune séance dans ce créneau"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[11px] font-mono text-gray-400"
                          dir="ltr"
                        >
                          {formatTime(alert.scannedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleResolveAlert(alert.id, "DISMISS")
                          }
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                          title={isAr ? "إغلاق" : "Fermer"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{alert.studentName}</span>
                        <span className="text-emerald-600 font-mono text-xs">
                          (#{alert.globalNumber})
                        </span>
                      </div>
                      <p className="text-gray-600">
                        {isAr
                          ? "التلميذ غير مسجل في أي فوج يدرس في هذا التوقيت."
                          : "Inscrit dans aucun groupe ayant cours dans ce créneau."}
                      </p>
                      {alert.nextLessonInfo && (
                        <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50/80 border border-amber-200/70 rounded-md px-2.5 py-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            {isAr ? "الحصة القادمة:" : "Prochaine séance:"}{" "}
                            {alert.nextLessonInfo}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => openCatchUpModalForScan(alert)}
                        className="flex-1 py-1.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>
                          {isAr ? "تسجيل حصة تعويض" : "Marquer rattrapage"}
                        </span>
                      </button>
                      {alert.studentId && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/list/students/${alert.studentId}`)
                          }
                          className="py-1.5 px-3 rounded-md bg-white hover:bg-gray-50 text-gray-700 font-medium text-xs flex items-center justify-center gap-1.5 border border-gray-300 cursor-pointer transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                          <span>{isAr ? "الملف" : "Profil"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* ZONE A (LOWER LIVE PASSING STREAM): State 1 (SUCCESS) & State 4   */}
          {/* ----------------------------------------------------------------- */}
          {liveStreamCard && (
            <div className="pointer-events-auto">
              {liveStreamCard.status === "SUCCESS" ? (
                // STATE 1: LIGHT APPLICATION CARD WITH EMERALD ACCENT (PRESENT + CREDITS OK)
                <div className="rounded-xl bg-white text-gray-800 border border-emerald-200 border-s-4 border-s-emerald-500 shadow-lg p-3.5 transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <BiometricStatusDot variant="success" />
                      <span className="text-xs font-semibold text-emerald-700">
                        {liveStreamCard.alreadyPresent
                          ? isAr
                            ? "تم تسجيل الحضور مسبقاً"
                            : "Déjà pointé (Présent)"
                          : isAr
                          ? "تم تسجيل الحضور بنجاح"
                          : "Présence enregistrée"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[11px] font-mono text-gray-400"
                        dir="ltr"
                      >
                        {formatTime(liveStreamCard.scannedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLiveStreamCard(null)}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{liveStreamCard.studentName}</span>
                      <span className="text-emerald-600 font-mono text-xs">
                        (#{liveStreamCard.globalNumber})
                      </span>
                    </div>
                    <div className="text-gray-600 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-800">
                          {liveStreamCard.className}
                        </span>
                      </span>
                      {liveStreamCard.classroomName && (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <DoorOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{liveStreamCard.classroomName}</span>
                        </span>
                      )}
                      {liveStreamCard.lessonStartsAt && (
                        <span className="font-mono text-gray-500" dir="ltr">
                          ({formatShortTime(liveStreamCard.lessonStartsAt)} -{" "}
                          {formatShortTime(liveStreamCard.lessonEndsAt)})
                        </span>
                      )}
                    </div>
                    <div className="pt-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                        <CreditCard className="w-3 h-3 shrink-0" />
                        <span>
                          {isAr
                            ? `الرصيد المتبقي: ${liveStreamCard.remainingCredits ?? 0} حصص`
                            : `Solde : ${liveStreamCard.remainingCredits ?? 0} séance(s) restante(s)`}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                // STATE 4: SMOOTH FLASHING RED <-> GREEN LIGHT CARD (UNRECOGNIZED FINGERPRINT)
                <div className="rounded-xl bg-white text-gray-800 border-2 biometric-flash-red-green shadow-lg p-3.5 transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <BiometricStatusDot variant="red-green" />
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase border biometric-badge-red-green">
                        {isAr ? "غير معروفة" : "Non reconnue"}
                      </span>
                      <span className="text-xs font-semibold text-gray-800">
                        {isAr
                          ? "لم يتم التعرف على البصمة"
                          : "Empreinte non reconnue"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLiveStreamCard(null)}
                      className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex items-start gap-1.5 font-medium text-gray-800">
                      <HelpCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <span>
                        {isAr
                          ? "البصمة غير مسجلة في النظام أو لم توضع بشكل صحيح على القارئ."
                          : "Doigt non enregistré ou mal positionné sur le lecteur K50 Pro."}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 text-gray-500 text-[11px]">
                      <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span>
                        {isAr
                          ? "إذا كان التلميذ جديداً، يرجى تسجيل بصمته من استمارة التلميذ."
                          : "Si l'étudiant est nouveau, enregistrez son empreinte depuis sa fiche."}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* §7.3 COLLAPSIBLE LIVE FEED DRAWER (MATCHES APPLICATION UI)            */}
      {/* ===================================================================== */}
      {isDrawerOpen && (
        <div
          dir={isAr ? "rtl" : "ltr"}
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white h-full shadow-xl flex flex-col border-s border-gray-200 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {isAr
                      ? "سجل الحضور بالبصمة المباشر"
                      : "Journal Biométrique en Direct"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {isAr
                      ? `${recentScans.length} عملية مسح نشطة`
                      : `${recentScans.length} pointage(s) actif(s)`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSyncK50Devices}
                  disabled={isSyncingK50}
                  className="px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title={
                    isAr
                      ? "مزامنة جميع البصمات مع أجهزة الفروع الأخرى"
                      : "Synchroniser toutes les empreintes avec les lecteurs K50 des autres branches"
                  }
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-blue-600 ${
                      isSyncingK50 ? "animate-spin" : ""
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {isSyncingK50
                      ? isAr
                        ? "مزامنة..."
                        : "Synchronisation..."
                      : isAr
                      ? "مزامنة الفروع"
                      : "Sync K50"}
                  </span>
                </button>
                {recentScans.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearJournal}
                    className="px-2.5 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-red-50 hover:border-red-200 text-gray-600 hover:text-red-600 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    title={isAr ? "مسح السجل بالكامل" : "Vider le journal"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {isAr ? "مسح السجل" : "Vider"}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer transition-colors"
                  title={
                    isMuted
                      ? isAr
                        ? "تفعيل الصوت"
                        : "Activer le son"
                      : isAr
                      ? "كتم الصوت"
                      : "Couper le son"
                  }
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-500" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-600" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-200 bg-gray-50/50 space-y-2.5">
              <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setDrawerTab("ALL")}
                  className={`py-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                    drawerTab === "ALL"
                      ? "bg-white text-gray-900 shadow-2xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <span>{isAr ? "الكل" : "Tous"}</span>
                  <span className="text-[10px] text-gray-400">
                    ({recentScans.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("NO_CREDITS")}
                  className={`py-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    drawerTab === "NO_CREDITS"
                      ? "bg-white text-red-700 shadow-2xs"
                      : "text-gray-600 hover:text-red-700"
                  }`}
                >
                  <BiometricStatusDot variant="danger" size="sm" />
                  <span>{isAr ? "بدون رصيد" : "Sans solde"}</span>
                  <span className="text-[10px] opacity-75">
                    ({recentScans.filter((s) => s.status === "NO_CREDITS").length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("NO_UPCOMING_GROUP")}
                  className={`py-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    drawerTab === "NO_UPCOMING_GROUP"
                      ? "bg-white text-amber-800 shadow-2xs"
                      : "text-gray-600 hover:text-amber-800"
                  }`}
                >
                  <BiometricStatusDot variant="green-red" size="sm" />
                  <span>{isAr ? "تعويض" : "Hors crén."}</span>
                  <span className="text-[10px] opacity-75">
                    (
                    {
                      recentScans.filter(
                        (s) => s.status === "NO_UPCOMING_GROUP"
                      ).length
                    }
                    )
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("SUCCESS")}
                  className={`py-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    drawerTab === "SUCCESS"
                      ? "bg-white text-emerald-700 shadow-2xs"
                      : "text-gray-600 hover:text-emerald-700"
                  }`}
                >
                  <BiometricStatusDot variant="success" size="sm" />
                  <span>{isAr ? "حاضر" : "Présents"}</span>
                  <span className="text-[10px] opacity-75">
                    ({recentScans.filter((s) => s.status === "SUCCESS").length})
                  </span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 shadow-2xs">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? "بحث بالاسم، الرقم (#)، أو الفوج..."
                      : "Rechercher par nom, #ID ou groupe..."
                  }
                  className="w-full bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
                />
                {drawerSearch && (
                  <button
                    type="button"
                    onClick={() => setDrawerSearch("")}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scan Feed List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/40">
              {filteredDrawerScans.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs space-y-2">
                  <Fingerprint className="w-8 h-8 mx-auto opacity-35" />
                  <p>
                    {isAr
                      ? "لا توجد عمليات مسح في السجل حالياً."
                      : "Aucun pointage dans le journal pour le moment."}
                  </p>
                </div>
              ) : (
                filteredDrawerScans.map((scan) => (
                  <div
                    key={scan.id}
                    className={`rounded-xl p-3 border text-xs bg-white shadow-2xs transition-all ${
                      scan.status === "SUCCESS"
                        ? "border-gray-200 border-s-4 border-s-emerald-500"
                        : scan.status === "NO_CREDITS"
                        ? "border-red-200 border-s-4 border-s-red-500"
                        : scan.status === "NO_UPCOMING_GROUP"
                        ? "border-amber-200 border-s-4 border-s-amber-500"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <BiometricStatusDot
                          variant={
                            scan.status === "SUCCESS"
                              ? "success"
                              : scan.status === "NO_CREDITS"
                              ? "danger"
                              : scan.status === "NO_UPCOMING_GROUP"
                              ? "green-red"
                              : "red-green"
                          }
                          size="sm"
                        />
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            scan.status === "SUCCESS"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : scan.status === "NO_CREDITS"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : scan.status === "NO_UPCOMING_GROUP"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          {scan.status === "SUCCESS"
                            ? isAr
                              ? "حاضر"
                              : "Présent"
                            : scan.status === "NO_CREDITS"
                            ? isAr
                              ? "رصيد منتهي (0)"
                              : "Solde épuisé (0)"
                            : scan.status === "NO_UPCOMING_GROUP"
                            ? isAr
                              ? "خارج التوقيت"
                              : "Hors créneau"
                            : isAr
                            ? "غير معروفة"
                            : "Non reconnue"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[11px] font-mono text-gray-400"
                          dir="ltr"
                        >
                          {formatTime(scan.scannedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleResolveAlert(scan.id, "DISMISS")}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                          title={isAr ? "حذف من السجل" : "Retirer du journal"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {scan.studentName ? (
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{scan.studentName}</span>
                        <span className="text-gray-500 font-mono text-[11px]">
                          (#{scan.globalNumber})
                        </span>
                      </div>
                    ) : (
                      <div className="font-medium text-gray-500">
                        {isAr
                          ? "بصمة غير مسجلة في النظام"
                          : "Empreinte non enregistrée"}
                      </div>
                    )}

                    {scan.className && (
                      <div className="text-gray-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{scan.className}</span>
                        </span>
                        {scan.classroomName && (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <DoorOpen className="w-3 h-3 text-gray-400 shrink-0" />
                            <span>{scan.classroomName}</span>
                          </span>
                        )}
                        {scan.remainingCredits !== null && (
                          <span className="font-semibold text-gray-800">
                            ({scan.remainingCredits}{" "}
                            {isAr ? "حصص متبقية" : "séances rest."})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Quick Action Buttons in Drawer */}
                    {scan.status === "NO_CREDITS" && !scan.isResolved && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        {scan.studentId && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsDrawerOpen(false);
                              router.push(`/list/students/${scan.studentId}`);
                            }}
                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>{isAr ? "تسديد" : "Encaisser"}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleResolveAlert(scan.id, "ALLOW_PRESENT")
                          }
                          className="px-2.5 py-1 rounded-md bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>
                            {isAr ? "سماح بالحضور" : "Autoriser présence"}
                          </span>
                        </button>
                      </div>
                    )}

                    {scan.status === "NO_UPCOMING_GROUP" && !scan.isResolved && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => openCatchUpModalForScan(scan)}
                          className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>
                            {isAr ? "تسجيل تعويض" : "Marquer rattrapage"}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Live Hardware Status Footer */}
            <div className="p-3 border-t border-gray-200 bg-white text-gray-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-medium text-gray-700">
                <Fingerprint className="w-4 h-4 text-blue-600 shrink-0" />
                <span>ZKTeco K50 Pro</span>
                <span className="font-mono text-[11px] text-gray-400" dir="ltr">
                  ({deviceEndpoint})
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                  deviceConnected
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                <BiometricStatusDot
                  variant={deviceConnected ? "success" : "offline"}
                  size="sm"
                />
                <span>
                  {deviceConnected
                    ? isAr
                      ? "متصل مباشر"
                      : "Connecté en direct"
                    : isAr
                    ? "جاري الاتصال..."
                    : "Connexion..."}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ONE-CLICK CATCH-UP (RATTRAPAGE) MODAL FOR STATE 3 SCANS               */}
      {/* ===================================================================== */}
      {catchUpTargetScan && (
        <div
          dir={isAr ? "rtl" : "ltr"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onClick={() => setCatchUpTargetScan(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-gray-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  <span>
                    {isAr
                      ? "تسجيل حضور تعويض (Rattrapage)"
                      : "Enregistrer un Rattrapage"}
                  </span>
                </h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    {catchUpTargetScan.studentName} (#
                    {catchUpTargetScan.globalNumber})
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCatchUpTargetScan(null)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {catchUpOptions.loading ? (
              <div className="py-8 text-center text-xs text-gray-500">
                {isAr ? "جاري تحميل الحصص..." : "Chargement des séances..."}
              </div>
            ) : (
              <form onSubmit={handleSaveCatchUp} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr
                      ? "1. الحصة الفائتة المراد تعويضها :"
                      : "1. Séance manquée à rattraper :"}
                  </label>
                  {catchUpOptions.uncaughtMissedLessons.length === 0 ? (
                    <p className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                      {isAr
                        ? "لا توجد غيابات سابقة مسجلة لهذا التلميذ."
                        : "Aucune absence non rattrapée trouvée pour cet étudiant."}
                    </p>
                  ) : (
                    <select
                      value={selectedMissedLessonId}
                      onChange={(e) => setSelectedMissedLessonId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white outline-none focus:border-blue-600"
                      required
                    >
                      {catchUpOptions.uncaughtMissedLessons.map((m) => (
                        <option key={m.lessonId} value={m.lessonId}>
                          {m.className} ({m.teacherName}) —{" "}
                          {new Date(m.startsAt).toLocaleDateString("fr-DZ")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr
                      ? "2. الفوج الحالي الحاضر فيه الآن :"
                      : "2. Séance actuelle d'accueil :"}
                  </label>
                  {catchUpOptions.activeBranchLessons.length === 0 ? (
                    <p className="p-2.5 rounded-md bg-gray-100 border border-gray-200 text-gray-600">
                      {isAr
                        ? "لا توجد حصص جارية حالياً في هذا الفرع."
                        : "Aucune séance active dans ce siège en ce moment."}
                    </p>
                  ) : (
                    <select
                      value={selectedCatchUpLessonId}
                      onChange={(e) =>
                        setSelectedCatchUpLessonId(e.target.value)
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white outline-none focus:border-blue-600"
                      required
                    >
                      {catchUpOptions.activeBranchLessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.className} ({l.classroomName || l.teacherName}) —{" "}
                          {formatShortTime(l.startsAt)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setCatchUpTargetScan(null)}
                    className="px-3.5 py-2 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 cursor-pointer"
                  >
                    {isAr ? "إلغاء" : "Annuler"}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isSavingCatchUp ||
                      !selectedMissedLessonId ||
                      !selectedCatchUpLessonId
                    }
                    className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold cursor-pointer"
                  >
                    {isSavingCatchUp
                      ? isAr
                        ? "جاري الحفظ..."
                        : "Enregistrement..."
                      : isAr
                      ? "تأكيد التعويض"
                      : "Valider le rattrapage"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </BiometricMonitorContext.Provider>
  );
}
