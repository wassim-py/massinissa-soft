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
import { useRouter, usePathname, Link } from "@/i18n/navigation";
import { toast } from "react-toastify";
import { notifyAttendanceChanged } from "@/lib/attendanceEvents";
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
  Sparkles,
  Users,
  ShieldAlert,
  AlertCircle,
  GraduationCap,
} from "lucide-react";
import {
  type BiometricScanResult,
  resolveBiometricAlertAction,
  clearBiometricJournalAction,
  getBiometricCatchUpOptionsAction,
  recordBiometricCatchUpAction,
  getBiometricPaymentDataAction,
} from "@/lib/biometricActions";
import {
  getBiometricScansLiveBillingAction,
  type BiometricScanLiveBillingInfo,
} from "@/lib/actions";
import PaymentForm from "@/components/forms/PaymentForm";
import { formatDZD } from "@/lib/algiersDate";

export type BiometricScanDisplayItem = BiometricScanResult & {
  isFormation?: boolean;
  formationPrice?: number;
  totalPaidFormation?: number;
  formationRemaining?: number;
  isFormationPaidInFull?: boolean;
  isFormationPartiallyPaid?: boolean;
  isSchoolFeesOnly?: boolean;
  hasSiblingDiscount?: boolean;
  siblingDiscountPct?: number;
  isPayerSiblingPaid?: boolean;
  payerRemainingCredit?: number | null;
  resolvedClassId?: number | null;
  resolvedClassName?: string | null;
  billingSynced?: boolean;
  isPendingVerification?: boolean;
};

interface BiometricMonitorContextType {
  isEnabled: boolean;
  setIsEnabled: (val: boolean) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (val: boolean) => void;
  recentScans: BiometricScanDisplayItem[];
  pinnedAlerts: BiometricScanDisplayItem[];
  liveStreamCard: BiometricScanDisplayItem | null;
  deviceConnected: boolean;
  handleResolveAlert: (
    scanId: number,
    mode: "DISMISS" | "ALLOW_PRESENT" | "RESOLVED_BY_PAYMENT" | "RESOLVED_BY_CATCHUP"
  ) => Promise<void>;
  handleDismissPopup: (scanId: number) => Promise<void>;
  handleClearJournal: () => Promise<void>;
  handleSyncK50Devices: () => Promise<void>;
  isSyncingK50: boolean;
  openCatchUpModalForScan: (scan: BiometricScanDisplayItem) => void;
  openPaymentModalForScan: (scan: BiometricScanDisplayItem) => void;
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
  handleDismissPopup: async () => {},
  handleClearJournal: async () => {},
  handleSyncK50Devices: async () => {},
  openCatchUpModalForScan: () => {},
  openPaymentModalForScan: () => {},
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

/**
 * Inscription Fees Status Badge for Biometric HUD Popups and Drawer
 */
function InscriptionStatusBadge({
  status,
  isAr,
}: {
  status?: "PAID" | "WAIVED" | "UNPAID" | null;
  isAr: boolean;
}) {
  if (!status) return null;
  if (status === "PAID") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px] shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>{isAr ? "حقوق التسجيل: مسددة" : "Inscr. : Payée"}</span>
      </span>
    );
  }
  if (status === "WAIVED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-semibold text-[11px] shrink-0">
        <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
        <span>{isAr ? "حقوق التسجيل: معفى" : "Inscr. : Exonérée"}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] shrink-0">
      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
      <span>{isAr ? "حقوق التسجيل: غير مسددة" : "Inscr. : Non payée"}</span>
    </span>
  );
}

/**
 * Group Type (Formation vs Normal Group) & Student Payment Type Badges
 */
export function BiometricGroupAndPaymentBadges({
  scan,
  isAr,
  compact = false,
}: {
  scan: BiometricScanDisplayItem;
  isAr: boolean;
  compact?: boolean;
}) {
  const hasGroup = Boolean(
    scan.className ||
      scan.resolvedClassName ||
      scan.classId ||
      scan.resolvedClassId ||
      scan.isFormation !== undefined
  );
  const isFormation = Boolean(scan.isFormation);
  const isNonPayer = Boolean(
    scan.isNonPayer ||
      scan.payerStatus === "NON_PAYER" ||
      scan.payerStatus === "FREE_ALL" ||
      scan.payerStatus === "FREE_TUITION"
  );
  const isSiblingWaived = Boolean(scan.isSiblingWaived);
  const hasSiblingDiscount = Boolean(
    !isSiblingWaived &&
      (scan.hasSiblingDiscount || scan.hasPayerSibling)
  );
  const discountPct = Number(scan.siblingDiscountPct || 50);
  const isSchoolFeesOnly = Boolean(
    scan.isSchoolFeesOnly || scan.payerStatus === "SCHOOL_FEES_ONLY"
  );

  const badgeSize = compact
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-[10px]";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasGroup && (
        <span
          className={`inline-flex items-center gap-1 rounded font-semibold border shrink-0 ${badgeSize} ${
            isFormation
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-slate-100 text-slate-700 border-slate-200"
          }`}
        >
          <GraduationCap className="w-3 h-3 shrink-0" />
          <span>
            {isFormation
              ? isAr
                ? "تكوين"
                : "Formation"
              : isAr
              ? "فوج عادي"
              : "Groupe normal"}
          </span>
        </span>
      )}

      {scan.studentId && (
        <span
          className={`inline-flex items-center gap-1 rounded font-semibold border shrink-0 ${badgeSize} ${
            isNonPayer
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : isSiblingWaived
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : hasSiblingDiscount
              ? "bg-violet-50 text-violet-700 border-violet-200"
              : isSchoolFeesOnly
              ? "bg-sky-50 text-sky-800 border-sky-200"
              : "bg-blue-50 text-blue-700 border-blue-200"
          }`}
        >
          {isNonPayer ? (
            <>
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{isAr ? "غير دافع (معفى)" : "Non-payeur (Exonéré)"}</span>
            </>
          ) : isSiblingWaived ? (
            <>
              <Users className="w-3 h-3 shrink-0" />
              <span>
                {isAr
                  ? "أخ دافع (معفى 100%)"
                  : "Frère/Sœur payeur (Exonéré 100%)"}
              </span>
            </>
          ) : hasSiblingDiscount ? (
            <>
              <Users className="w-3 h-3 shrink-0" />
              <span>
                {isAr
                  ? `خصم إخوة (-${discountPct}%)`
                  : `Remise fratrie (-${discountPct}%)`}
              </span>
            </>
          ) : isSchoolFeesOnly ? (
            <>
              <ShieldAlert className="w-3 h-3 shrink-0" />
              <span>
                {isAr ? "دافع حصة المدرسة فقط" : "Payeur part école seule"}
              </span>
            </>
          ) : (
            <>
              <User className="w-3 h-3 shrink-0" />
              <span>{isAr ? "دافع عادي" : "Payeur normal"}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Exact Remaining Lessons / Formation Payment Status Badge
 * Shows exact remaining sessions even when negative (-1, -2, 0, 1, 2...)
 */
export function BiometricRemainingLessonsBadge({
  scan,
  isAr,
  compact = false,
}: {
  scan: BiometricScanDisplayItem;
  isAr: boolean;
  compact?: boolean;
}) {
  if (!scan.studentId) return null;

  const isFormation = Boolean(scan.isFormation);
  const isNonPayer = Boolean(
    scan.isNonPayer ||
      scan.payerStatus === "NON_PAYER" ||
      scan.payerStatus === "FREE_ALL" ||
      scan.payerStatus === "FREE_TUITION"
  );
  const isSiblingWaived = Boolean(scan.isSiblingWaived);
  const hasSiblingDiscount = Boolean(
    !isSiblingWaived &&
      (scan.hasSiblingDiscount || scan.hasPayerSibling)
  );
  const discountPct = Number(scan.siblingDiscountPct || 50);
  const isSchoolFeesOnly = Boolean(
    scan.isSchoolFeesOnly || scan.payerStatus === "SCHOOL_FEES_ONLY"
  );

  const badgeSize = compact
    ? "px-2 py-0.5 text-[10px]"
    : "px-2.5 py-1 text-[11px]";

  if (isFormation) {
    if (isNonPayer) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0 ${badgeSize}`}
        >
          <Sparkles className="w-3 h-3 shrink-0 text-emerald-600" />
          <span>
            {isAr
              ? "التكوين: معفى من الرسوم"
              : "Formation : Exonéré des frais"}
          </span>
        </span>
      );
    }

    if (isSiblingWaived) {
      const siblingPaid = scan.isPayerSiblingPaid !== false;
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md font-semibold border shrink-0 ${badgeSize} ${
            siblingPaid
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          <Users className="w-3 h-3 shrink-0" />
          <span>
            {siblingPaid
              ? isAr
                ? "التكوين: معفى (أخ دافع مسدد)"
                : "Formation : Exonéré (Fratrie payée)"
              : isAr
              ? "التكوين: غير مسدد (أخ دافع غير مسدد)"
              : "Formation : Non payée (Fratrie impayée)"}
          </span>
        </span>
      );
    }

    if (scan.isFormationPaidInFull) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0 ${badgeSize}`}
        >
          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" />
          <span>
            {isAr ? "التكوين: مسدد بالكامل" : "Formation : Payée en totalité"}
          </span>
        </span>
      );
    }

    if (scan.isFormationPartiallyPaid) {
      const remDzd = Number(scan.formationRemaining ?? 0);
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold shrink-0 ${badgeSize}`}
        >
          <CreditCard className="w-3 h-3 shrink-0 text-amber-600" />
          <span>
            {isAr
              ? `دفع جزئي للتكوين (المتبقي: ${remDzd.toLocaleString("ar-DZ")} دج)`
              : `Paiement partiel (Reste : ${remDzd.toLocaleString("fr-DZ")} DZD)`}
          </span>
        </span>
      );
    }

    const totalDzd = Number(scan.formationPrice ?? 0);
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-semibold shrink-0 ${badgeSize}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0 text-red-600" />
        <span>
          {isAr
            ? `التكوين غير مسدد${totalDzd > 0 ? ` (${totalDzd.toLocaleString("ar-DZ")} دج)` : ""}`
            : `Formation non payée${totalDzd > 0 ? ` (${totalDzd.toLocaleString("fr-DZ")} DZD)` : ""}`}
        </span>
      </span>
    );
  }

  // Normal Group (4-session cycle)
  if (isNonPayer) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0 ${badgeSize}`}
      >
        <Sparkles className="w-3 h-3 shrink-0 text-emerald-600" />
        <span>
          {isAr ? "الحصص: معفى من الرسوم" : "Séances : Exonéré des frais"}
        </span>
      </span>
    );
  }

  if (isSiblingWaived) {
    const payerRem =
      scan.payerRemainingCredit !== undefined && scan.payerRemainingCredit !== null
        ? Number(scan.payerRemainingCredit)
        : scan.remainingCredits !== undefined && scan.remainingCredits !== null
        ? Number(scan.remainingCredits)
        : 0;
    const isPositive = payerRem > 0 && scan.isPayerSiblingPaid !== false;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold border shrink-0 ${badgeSize} ${
          isPositive
            ? "bg-purple-50 text-purple-700 border-purple-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}
      >
        <Users className="w-3 h-3 shrink-0" />
        <span>
          {isAr
            ? `الحصص المتبقية (أخ دافع): ${payerRem} حصص`
            : `Séances restantes (Fratrie) : ${payerRem} séance(s)`}
        </span>
      </span>
    );
  }

  const exactRemaining =
    scan.remainingCredits !== undefined && scan.remainingCredits !== null
      ? Number(scan.remainingCredits)
      : 0;
  const isPositive = exactRemaining > 0;

  if (hasSiblingDiscount) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold border shrink-0 ${badgeSize} ${
          isPositive
            ? "bg-violet-50 text-violet-800 border-violet-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}
      >
        <Users className="w-3 h-3 shrink-0" />
        <span>
          {isAr
            ? `الحصص المتبقية: ${exactRemaining} حصص (خصم إخوة -${discountPct}%)`
            : `Séances restantes : ${exactRemaining} séance(s) (Remise -${discountPct}%)`}
        </span>
      </span>
    );
  }

  if (isSchoolFeesOnly) {
    const isWarning = exactRemaining === 1;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold border shrink-0 ${badgeSize} ${
          exactRemaining <= 0
            ? "bg-red-50 text-red-700 border-red-200"
            : isWarning
            ? "bg-amber-50 text-amber-800 border-amber-200"
            : "bg-sky-50 text-sky-800 border-sky-200"
        }`}
      >
        <ShieldAlert className="w-3 h-3 shrink-0" />
        <span>
          {isAr
            ? exactRemaining <= 0
              ? exactRemaining < 0
                ? `الحصص المتبقية: ${exactRemaining} حصة (دين - حصة المدرسة)`
                : "الحصص المتبقية: 0 حصة (حصة المدرسة)"
              : exactRemaining === 1
              ? "حصة واحدة متبقية (حصة المدرسة)"
              : `الحصص المتبقية: ${exactRemaining} حصص (حصة المدرسة)`
            : exactRemaining <= 0
              ? exactRemaining < 0
                ? `Séances restantes : ${exactRemaining} (dette - Part école)`
                : "Séances restantes : 0 (Part école)"
              : exactRemaining === 1
              ? "1 séance restante (Part école)"
              : `Séances restantes : ${exactRemaining} séance(s) (Part école)`}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold border shrink-0 ${badgeSize} ${
        isPositive
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      <CreditCard className="w-3 h-3 shrink-0" />
      <span>
        {isAr
          ? `الحصص المتبقية: ${exactRemaining} حصص`
          : `Séances restantes : ${exactRemaining} séance(s)`}
      </span>
    </span>
  );
}

let sharedBiometricAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedBiometricAudioCtx || sharedBiometricAudioCtx.state === "closed") {
    sharedBiometricAudioCtx = new AudioCtx();
  }
  if (sharedBiometricAudioCtx.state === "suspended") {
    sharedBiometricAudioCtx.resume().catch(() => {});
  }
  return sharedBiometricAudioCtx;
}

// Distinct Web Audio API Sound Effects for Biometric States + Instant Scan Read Tick
function playBiometricTone(
  type:
    | "SUCCESS"
    | "NO_CREDITS"
    | "NO_UPCOMING_GROUP"
    | "UNRECOGNIZED"
    | "SCAN_PENDING"
) {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const scheduleTone = (
      oscType: OscillatorType,
      startFreq: number,
      endFreq: number | null,
      freqChangeOffset: number,
      gainVal: number,
      startTime: number,
      duration: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(startFreq, startTime);
      if (endFreq !== null) {
        osc.frequency.setValueAtTime(endFreq, startTime + freqChangeOffset);
      }
      gain.gain.setValueAtTime(gainVal, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    if (type === "SCAN_PENDING") {
      scheduleTone("sine", 880, null, 0, 0.08, now, 0.055);
    } else if (type === "SUCCESS") {
      scheduleTone("sine", 523.25, 783.99, 0.1, 0.18, now, 0.35);
    } else if (type === "NO_CREDITS") {
      for (let i = 0; i < 2; i++) {
        scheduleTone("sawtooth", 310, null, 0, 0.2, now + i * 0.18, 0.14);
      }
    } else if (type === "NO_UPCOMING_GROUP") {
      scheduleTone("triangle", 660, 440, 0.15, 0.18, now, 0.35);
    } else {
      scheduleTone("square", 190, null, 0, 0.15, now, 0.28);
    }
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export default function BiometricMonitorProvider({
  children,
  initialBranchId,
}: {
  children: React.ReactNode;
  initialBranchId?: number;
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

  // Fingerprint background monitor is permanently active and cannot be turned off from the UI
  const isEnabled = true;
  const [isMuted, setIsMutedState] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [recentScans, setRecentScans] = useState<BiometricScanDisplayItem[]>([]);
  const [pinnedAlerts, setPinnedAlerts] = useState<BiometricScanDisplayItem[]>([]);
  const [liveStreamCard, setLiveStreamCard] = useState<BiometricScanDisplayItem | null>(null);
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [isHoveringActionZone, setIsHoveringActionZoneState] = useState<boolean>(false);
  const isHoveringActionZoneRef = useRef<boolean>(false);
  const setIsHoveringActionZone = useCallback((val: boolean) => {
    isHoveringActionZoneRef.current = val;
    setIsHoveringActionZoneState(val);
  }, []);
  const [showAllPinnedInHud, setShowAllPinnedInHud] = useState<boolean>(false);

  // Drawer filter & search state
  const [drawerTab, setDrawerTab] = useState<
    "ALL" | "NO_CREDITS" | "NO_UPCOMING_GROUP" | "SUCCESS"
  >("ALL");
  const [drawerSearch, setDrawerSearch] = useState<string>("");
  const [deviceEndpoint, setDeviceEndpoint] = useState<string>("192.168.50.201:4370");

  // Catch-up (Rattrapage) Modal state for State 3 cards
  const [catchUpTargetScan, setCatchUpTargetScan] =
    useState<BiometricScanDisplayItem | null>(null);
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

  // Payment Modal state for State 2 cards
  const [paymentTargetScan, setPaymentTargetScan] =
    useState<BiometricScanDisplayItem | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [paymentData, setPaymentData] = useState<{
    student: any;
    classData: any;
    availableClasses: any[];
    defaultInscriptionFee: number;
  } | null>(null);
  const [selectedPaymentClassId, setSelectedPaymentClassId] = useState<string>("");

  const lastSeenIdRef = useRef<number>(0);
  const currentBranchIdRef = useRef<number | null>(
    initialBranchId && !isNaN(Number(initialBranchId))
      ? Number(initialBranchId)
      : null
  );
  const isInitializedRef = useRef<boolean>(false);
  const liveCardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMutedRef = useRef<boolean>(false);

  // Persistent client-side tracking for dismissed popups & persistent journal
  const dismissedAlertIdsRef = useRef<Set<number>>(new Set());
  const dismissedStudentMaxScanIdRef = useRef<Map<string, number>>(new Map());
  const removedJournalIdsRef = useRef<Set<number>>(new Set());
  const clearedBeforeIdRef = useRef<number>(0);
  const billingCacheRef = useRef<Map<number, BiometricScanLiveBillingInfo>>(new Map());

  const getBranchStorageSuffix = useCallback((branchIdOverride?: number | null) => {
    const bId =
      branchIdOverride ??
      currentBranchIdRef.current ??
      (initialBranchId && !isNaN(Number(initialBranchId))
        ? Number(initialBranchId)
        : 1);
    return String(bId);
  }, [initialBranchId]);

  const loadBranchPersistenceFromStorage = useCallback(
    (branchIdOverride?: number | null) => {
      if (typeof window === "undefined") return [];
      const suffix = getBranchStorageSuffix(branchIdOverride);
      try {
        const rawDismissed = localStorage.getItem(
          `massinissa_biometric_dismissed_alerts_v1_${suffix}`
        );
        if (rawDismissed) {
          const parsed = JSON.parse(rawDismissed);
          dismissedAlertIdsRef.current = new Set(
            Array.isArray(parsed?.ids) ? parsed.ids.map(Number) : []
          );
          const studentMap = new Map<string, number>();
          if (parsed?.byStudent && typeof parsed.byStudent === "object") {
            for (const [k, v] of Object.entries(parsed.byStudent)) {
              studentMap.set(k, Number(v));
            }
          }
          dismissedStudentMaxScanIdRef.current = studentMap;
        } else {
          dismissedAlertIdsRef.current = new Set();
          dismissedStudentMaxScanIdRef.current = new Map();
        }
      } catch {
        dismissedAlertIdsRef.current = new Set();
        dismissedStudentMaxScanIdRef.current = new Map();
      }

      try {
        const rawRemoved = localStorage.getItem(
          `massinissa_biometric_removed_journal_ids_v1_${suffix}`
        );
        if (rawRemoved) {
          const arr = JSON.parse(rawRemoved);
          removedJournalIdsRef.current = new Set(
            Array.isArray(arr) ? arr.map(Number) : []
          );
        } else {
          removedJournalIdsRef.current = new Set();
        }
      } catch {
        removedJournalIdsRef.current = new Set();
      }

      try {
        const rawClearedBefore = localStorage.getItem(
          `massinissa_biometric_cleared_before_id_v1_${suffix}`
        );
        clearedBeforeIdRef.current = rawClearedBefore
          ? Number(rawClearedBefore) || 0
          : 0;
      } catch {
        clearedBeforeIdRef.current = 0;
      }

      try {
        const rawJournal = localStorage.getItem(
          `massinissa_biometric_journal_v1_${suffix}`
        );
        if (rawJournal) {
          const parsedJournal = JSON.parse(rawJournal);
          if (Array.isArray(parsedJournal)) {
            return parsedJournal.filter(
              (s: any) =>
                s &&
                typeof s.id === "number" &&
                s.id > clearedBeforeIdRef.current &&
                !removedJournalIdsRef.current.has(s.id)
            ) as BiometricScanDisplayItem[];
          }
        }
      } catch {
        // ignore
      }
      return [];
    },
    [getBranchStorageSuffix]
  );

  const saveDismissedAlertsToStorage = useCallback(
    (branchIdOverride?: number | null) => {
      if (typeof window === "undefined") return;
      const suffix = getBranchStorageSuffix(branchIdOverride);
      try {
        const ids = Array.from(dismissedAlertIdsRef.current).slice(-500);
        const byStudent: Record<string, number> = {};
        dismissedStudentMaxScanIdRef.current.forEach((val, key) => {
          byStudent[key] = val;
        });
        localStorage.setItem(
          `massinissa_biometric_dismissed_alerts_v1_${suffix}`,
          JSON.stringify({ ids, byStudent })
        );
      } catch {
        // ignore
      }
    },
    [getBranchStorageSuffix]
  );

  const saveRemovedJournalIdsToStorage = useCallback(
    (branchIdOverride?: number | null) => {
      if (typeof window === "undefined") return;
      const suffix = getBranchStorageSuffix(branchIdOverride);
      try {
        const ids = Array.from(removedJournalIdsRef.current).slice(-500);
        localStorage.setItem(
          `massinissa_biometric_removed_journal_ids_v1_${suffix}`,
          JSON.stringify(ids)
        );
      } catch {
        // ignore
      }
    },
    [getBranchStorageSuffix]
  );

  const saveJournalToStorage = useCallback(
    (scans: BiometricScanDisplayItem[], branchIdOverride?: number | null) => {
      if (typeof window === "undefined") return;
      const suffix = getBranchStorageSuffix(branchIdOverride);
      try {
        localStorage.setItem(
          `massinissa_biometric_journal_v1_${suffix}`,
          JSON.stringify(scans.slice(0, 250))
        );
      } catch {
        // ignore
      }
    },
    [getBranchStorageSuffix]
  );

  const isAlertDismissed = useCallback((alert: BiometricScanResult) => {
    if (!alert) return true;
    if (alert.isResolved) return true;
    if (alert.id <= clearedBeforeIdRef.current) return true;
    if (dismissedAlertIdsRef.current.has(alert.id)) return true;
    if (removedJournalIdsRef.current.has(alert.id)) return true;
    if (alert.studentId) {
      const dismissedMax = dismissedStudentMaxScanIdRef.current.get(alert.studentId);
      if (dismissedMax !== undefined && alert.id <= dismissedMax) {
        return true;
      }
    }
    return false;
  }, []);

  const applyBillingInfoToScan = useCallback(
    (
      scan: BiometricScanDisplayItem,
      info?: BiometricScanLiveBillingInfo
    ): BiometricScanDisplayItem => {
      const resolvedInfo = info || billingCacheRef.current.get(scan.id);
      if (!resolvedInfo) return scan;
      return {
        ...scan,
        studentName: resolvedInfo.studentName || scan.studentName,
        globalNumber: resolvedInfo.globalNumber ?? scan.globalNumber,
        classId: scan.classId ?? resolvedInfo.resolvedClassId,
        className: scan.className || resolvedInfo.resolvedClassName,
        resolvedClassId: resolvedInfo.resolvedClassId,
        resolvedClassName: resolvedInfo.resolvedClassName,
        isFormation: resolvedInfo.isFormation,
        formationPrice: resolvedInfo.formationPrice,
        totalPaidFormation: resolvedInfo.totalPaidFormation,
        formationRemaining: resolvedInfo.formationRemaining,
        isFormationPaidInFull: resolvedInfo.isFormationPaidInFull,
        isFormationPartiallyPaid: resolvedInfo.isFormationPartiallyPaid,
        payerStatus: resolvedInfo.payerStatus,
        isNonPayer: resolvedInfo.isNonPayer,
        isSchoolFeesOnly: resolvedInfo.isSchoolFeesOnly,
        hasPayerSibling: resolvedInfo.hasPayerSibling,
        isSiblingWaived: resolvedInfo.isSiblingWaived,
        hasSiblingDiscount: resolvedInfo.hasSiblingDiscount,
        siblingDiscountPct: resolvedInfo.siblingDiscountPct,
        isPayerSiblingPaid: resolvedInfo.isPayerSiblingPaid,
        payerRemainingCredit: resolvedInfo.payerRemainingCredit,
        remainingCredits: resolvedInfo.remainingCredits,
        inscriptionStatus:
          resolvedInfo.inscriptionStatus ?? scan.inscriptionStatus,
        billingSynced: true,
      };
    },
    []
  );

  const syncScansWithLiveBilling = useCallback(
    async (scansToSync: BiometricScanDisplayItem[]) => {
      const validItems = scansToSync.filter(
        (s) => s && typeof s.id === "number" && s.studentId
      );
      if (validItems.length === 0) return;

      const queryItems = validItems.map((s) => ({
        scanId: s.id,
        studentId: s.studentId!,
        classId: s.classId ?? s.resolvedClassId ?? null,
        lessonId: s.lessonId ?? null,
        status: s.status,
        nextLessonInfo: s.nextLessonInfo ?? null,
      }));

      try {
        const res = await getBiometricScansLiveBillingAction(queryItems);
        if (!res?.success || !res.byScanId) return;

        for (const [k, v] of Object.entries(res.byScanId)) {
          billingCacheRef.current.set(Number(k), v);
        }

        setRecentScans((prev) => {
          const updated = prev.map((s) =>
            res.byScanId[s.id] ? applyBillingInfoToScan(s, res.byScanId[s.id]) : s
          );
          saveJournalToStorage(updated);
          return updated;
        });

        setPinnedAlerts((prev) =>
          prev.map((a) =>
            res.byScanId[a.id] ? applyBillingInfoToScan(a, res.byScanId[a.id]) : a
          )
        );

        setLiveStreamCard((curr) =>
          curr && res.byScanId[curr.id]
            ? applyBillingInfoToScan(curr, res.byScanId[curr.id])
            : curr
        );
      } catch {
        // ignore transient network errors
      }
    },
    [applyBillingInfoToScan, saveJournalToStorage]
  );

  // Hydrate persistent journal & dismissed alerts on mount / branch change
  useEffect(() => {
    if (
      initialBranchId &&
      !isNaN(Number(initialBranchId)) &&
      currentBranchIdRef.current !== Number(initialBranchId)
    ) {
      currentBranchIdRef.current = Number(initialBranchId);
    }
    const savedScans = loadBranchPersistenceFromStorage(
      currentBranchIdRef.current
    );
    if (savedScans.length > 0) {
      setRecentScans(savedScans);
      const maxSavedId = Math.max(...savedScans.map((s) => s.id));
      if (maxSavedId > lastSeenIdRef.current) {
        lastSeenIdRef.current = maxSavedId;
      }
      syncScansWithLiveBilling(savedScans);
    }
  }, [initialBranchId, loadBranchPersistenceFromStorage, syncScansWithLiveBilling]);

  // Re-sync live billing whenever the Journal Drawer is opened so any external payment/attendance changes are reflected
  useEffect(() => {
    if (isDrawerOpen && recentScans.length > 0) {
      syncScansWithLiveBilling(recentScans);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen]);

  // Reset hover lock when pinnedAlerts becomes empty
  useEffect(() => {
    if (pinnedAlerts.length === 0 && isHoveringActionZoneRef.current) {
      isHoveringActionZoneRef.current = false;
      setIsHoveringActionZoneState(false);
    }
  }, [pinnedAlerts.length]);

  useEffect(() => {
    try {
      // Ensure any legacy "false" setting in storage is cleared so fingerprint monitor stays active
      localStorage.setItem("massinissa_biometric_enabled", "true");
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
    if (val && typeof window !== "undefined") {
      // Trigger a fresh K50 Pro hardware handshake on explicit reconnect request
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

  const recentScansRef = useRef<BiometricScanDisplayItem[]>([]);
  useEffect(() => {
    recentScansRef.current = recentScans;
  }, [recentScans]);
  const lastPendingUnrecognizedAtRef = useRef<number>(0);

  // Unlock shared Web Audio context on first user interaction so kiosk/direct-PC browsers never block tones
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockAudio = () => {
      getSharedAudioContext();
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Process incoming scan into the Two-Zone Split HUD
  const announceIncomingScan = useCallback(
    (rawScan: BiometricScanDisplayItem) => {
      const scan = applyBillingInfoToScan(rawScan);
      if (!isMutedRef.current) {
        const isDuplicateUnrecognizedTone =
          scan.status === "UNRECOGNIZED" &&
          Date.now() - lastPendingUnrecognizedAtRef.current < 3000;
        if (!isDuplicateUnrecognizedTone) {
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
        !isAlertDismissed(scan)
      ) {
        // Clear any optimistic pending card in Zone A if this scan resolved to an alert in Zone B
        setLiveStreamCard((curr) =>
          curr?.isPendingVerification ? null : curr
        );
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
    [applyBillingInfoToScan, isAlertDismissed, openLessonId, router]
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
    (rawScan: BiometricScanResult) => {
      if (!rawScan || !rawScan.id) return;
      const scan = applyBillingInfoToScan(rawScan);
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
        const nextList = [scan, ...filtered].slice(0, 250);
        saveJournalToStorage(nextList);
        return nextList;
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
      if (scan.studentId) {
        syncScansWithLiveBilling([scan]);
      }
    },
    [
      announceIncomingScan,
      applyBillingInfoToScan,
      saveJournalToStorage,
      syncScansWithLiveBilling,
    ]
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
          const activeBranch =
            currentBranchIdRef.current ||
            (initialBranchId && !isNaN(Number(initialBranchId))
              ? Number(initialBranchId)
              : null);
          if (activeBranch) {
            fetch(
              `http://127.0.0.1:4375/status?appUrl=${encodeURIComponent(
                window.location.origin
              )}&branchId=${activeBranch}&openLessonId=${
                openLessonIdRef.current || ""
              }`,
              { cache: "no-store" }
            ).catch(() => {});
          }
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

            if (msg.type === "scan_pending") {
              // Instant <15ms optimistic visual & audio feedback the moment a finger touches the K50 Pro
              const pendingId = -Date.now();
              const scannedIso = msg.scanTime || new Date().toISOString();

              if (msg.isUnrecognizedFinger) {
                lastPendingUnrecognizedAtRef.current = Date.now();
                if (!isMutedRef.current) {
                  playBiometricTone("UNRECOGNIZED");
                }
                const optimisticUnrecognized: BiometricScanDisplayItem = {
                  id: pendingId,
                  deviceId: null,
                  studentId: null,
                  studentName: null,
                  globalNumber: null,
                  branchId: Number(msg.branchId || currentBranchIdRef.current || 1),
                  lessonId: null,
                  classId: null,
                  className: null,
                  classroomName: null,
                  lessonStartsAt: null,
                  lessonEndsAt: null,
                  status: "UNRECOGNIZED",
                  remainingCredits: 0,
                  isNonPayer: false,
                  hasPayerSibling: false,
                  isSiblingWaived: false,
                  payerStatus: undefined,
                  nextLessonInfo: null,
                  isResolved: false,
                  scannedAt: scannedIso,
                  isPendingVerification: true,
                };
                setLiveStreamCard(optimisticUnrecognized);
                if (liveCardTimeoutRef.current) {
                  clearTimeout(liveCardTimeoutRef.current);
                }
                liveCardTimeoutRef.current = setTimeout(() => {
                  setLiveStreamCard((curr) =>
                    curr?.id === pendingId ? null : curr
                  );
                }, 4500);
                return;
              }

              const gNum = Number(msg.globalNumber);
              if (gNum > 0) {
                if (!isMutedRef.current) {
                  playBiometricTone("SCAN_PENDING");
                }
                const prevMatch = recentScansRef.current.find(
                  (s) => s.globalNumber === gNum && s.studentName
                );
                const resolvedName =
                  msg.studentName ||
                  prevMatch?.studentName ||
                  (isAr ? `تلميذ #${gNum}` : `Élève #${gNum}`);

                const optimisticCard: BiometricScanDisplayItem = {
                  id: pendingId,
                  deviceId: null,
                  studentId: prevMatch?.studentId || null,
                  studentName: resolvedName,
                  globalNumber: gNum,
                  branchId: Number(msg.branchId || currentBranchIdRef.current || 1),
                  lessonId: null,
                  classId: prevMatch?.classId ?? prevMatch?.resolvedClassId ?? null,
                  className: prevMatch?.className || prevMatch?.resolvedClassName || null,
                  classroomName: prevMatch?.classroomName || null,
                  lessonStartsAt: null,
                  lessonEndsAt: null,
                  status: "SUCCESS",
                  remainingCredits: prevMatch?.remainingCredits ?? 0,
                  isNonPayer: Boolean(prevMatch?.isNonPayer),
                  hasPayerSibling: Boolean(prevMatch?.hasPayerSibling),
                  isSiblingWaived: Boolean(prevMatch?.isSiblingWaived),
                  payerStatus: prevMatch?.payerStatus || undefined,
                  inscriptionStatus: prevMatch?.inscriptionStatus || null,
                  nextLessonInfo: null,
                  isResolved: false,
                  scannedAt: scannedIso,
                  isPendingVerification: true,
                };
                setLiveStreamCard(optimisticCard);
                if (liveCardTimeoutRef.current) {
                  clearTimeout(liveCardTimeoutRef.current);
                }
                liveCardTimeoutRef.current = setTimeout(() => {
                  setLiveStreamCard((curr) =>
                    curr?.id === pendingId ? null : curr
                  );
                }, 4000);
              }
              return;
            }

            if (msg.type === "scan_resolved" && msg.scan) {
              ingestDirectScanResult(msg.scan);
              return;
            }

            if (msg.type === "scan") {
              if (msg.scan) {
                ingestDirectScanResult(msg.scan);
                return;
              }
              // Only post from browser if the bridge explicitly flagged a cloud POST failure fallback
              if (!msg.fallback) {
                return;
              }
              const branchId =
                currentBranchIdRef.current ||
                (initialBranchId && !isNaN(Number(initialBranchId))
                  ? Number(initialBranchId)
                  : undefined);
              const res = await fetch("/api/biometrics/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  globalNumber: msg.globalNumber ?? null,
                  isUnrecognizedFinger: Boolean(msg.isUnrecognizedFinger),
                  ...(branchId ? { branchId } : {}),
                  openLessonId: openLessonIdRef.current || null,
                }),
              });
              if (res.ok) {
                const resData = await res.json();
                if (resData?.success && resData.scan) {
                  ingestDirectScanResult(resData.scan);
                  // Self-heal tombstoned/deleted student from K50 Pro flash memory
                  if (
                    resData.scan.status === "UNRECOGNIZED" &&
                    resData.scan.isTombstoned &&
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
            retryTimer = setTimeout(connectLocalSse, 2000);
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
  }, [isEnabled, ingestDirectScanResult, initialBranchId]);

  // Background polling loop when isEnabled === true (pauses when tab is hidden)
  useEffect(() => {
    if (!isEnabled) return;

    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchWithTimeout = async (
      url: string,
      options: RequestInit,
      timeoutMs: number
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const pollFeed = async () => {
      if (isPollingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      isPollingRef.current = true;

      try {
        const lessonQuery = openLessonId ? `&openLessonId=${openLessonId}` : "";
        const bridgeQuery = "&bridgeActive=1";
        const res = await fetchWithTimeout(
          `/api/biometrics/scan?sinceId=${lastSeenIdRef.current}${lessonQuery}${bridgeQuery}`,
          { cache: "no-store" },
          6000
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
              nowMs - lastLocalBridgeFailAtRef.current > 4000))
        ) {
          try {
            const bridgeUrl = `http://127.0.0.1:4375/status?appUrl=${encodeURIComponent(
              window.location.origin
            )}&branchId=${data.branchId || 1}&openLessonId=${openLessonId || ""}`;
            const bridgeRes = await fetchWithTimeout(
              bridgeUrl,
              { cache: "no-store" },
              1500
            );
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
                  const postRes = await fetchWithTimeout(
                    "/api/biometrics/scan",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...ev,
                        branchId: data.branchId || 1,
                        openLessonId: openLessonId || null,
                      }),
                    },
                    6000
                  );
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
            // Local bridge not running on 127.0.0.1:4375 — wait 4s before retrying
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
          const resolvedBranchId = data.branchId
            ? Number(data.branchId)
            : 1;
          currentBranchIdRef.current = resolvedBranchId;
          const savedJournal = loadBranchPersistenceFromStorage(resolvedBranchId);
          const serverScans: BiometricScanDisplayItem[] = (
            data.recentScans || []
          ).filter(
            (s: BiometricScanResult) =>
              s &&
              s.id > clearedBeforeIdRef.current &&
              !removedJournalIdsRef.current.has(s.id)
          );

          // Merge serverScans with savedJournal so journal persists across refresh/restart/days until manually cleared
          const byId = new Map<number, BiometricScanDisplayItem>();
          for (const s of savedJournal) {
            byId.set(s.id, applyBillingInfoToScan(s));
          }
          for (const s of serverScans) {
            const existing = byId.get(s.id);
            byId.set(
              s.id,
              applyBillingInfoToScan({
                ...(existing || {}),
                ...s,
                isResolved: Boolean(existing?.isResolved || s.isResolved),
              })
            );
          }

          const mergedScans = Array.from(byId.values())
            .sort((a, b) => b.id - a.id)
            .slice(0, 250);

          setRecentScans(mergedScans);
          saveJournalToStorage(mergedScans, resolvedBranchId);

          const serverAlerts = ((data.pinnedAlerts || []) as BiometricScanDisplayItem[])
            .filter((a) => !isAlertDismissed(a))
            .map((a) => applyBillingInfoToScan(a));
          setPinnedAlerts(serverAlerts);

          if (mergedScans.length > 0) {
            lastSeenIdRef.current = Math.max(...mergedScans.map((s) => s.id));
          }

          const toSync = [...mergedScans, ...serverAlerts];
          if (toSync.length > 0) {
            syncScansWithLiveBilling(toSync);
          }
          return;
        }

        // Subsequent polls: detect newly arrived scans
        const newScans: BiometricScanDisplayItem[] = (
          data.recentScans || []
        ).filter(
          (s: BiometricScanResult) =>
            s &&
            s.id > clearedBeforeIdRef.current &&
            !removedJournalIdsRef.current.has(s.id)
        );
        if (newScans.length > 0) {
          const maxId = Math.max(...newScans.map((s) => s.id));
          if (maxId > lastSeenIdRef.current) {
            lastSeenIdRef.current = maxId;
          }
          const enrichedNew = newScans.map((s) => applyBillingInfoToScan(s));
          setRecentScans((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNew = enrichedNew.filter((s) => !existingIds.has(s.id));
            const hasNewUnrecognized = uniqueNew.some(
              (s) => s.status === "UNRECOGNIZED"
            );
            const basePrev = hasNewUnrecognized
              ? prev.filter((p) => p.status !== "UNRECOGNIZED")
              : prev;
            const nextList = [...uniqueNew, ...basePrev].slice(0, 250);
            saveJournalToStorage(nextList);
            return nextList;
          });

          const chronological = [...enrichedNew].sort((a, b) => a.id - b.id);
          for (const scan of chronological) {
            announceIncomingScan(scan);
          }

          syncScansWithLiveBilling(enrichedNew);
        }

        if (!isHoveringActionZoneRef.current && data.pinnedAlerts) {
          const filteredAlerts = (
            data.pinnedAlerts as BiometricScanDisplayItem[]
          )
            .filter((a) => !isAlertDismissed(a))
            .map((a) => applyBillingInfoToScan(a));
          setPinnedAlerts(filteredAlerts);
          const unsyncedAlerts = filteredAlerts.filter(
            (a) => !a.billingSynced && a.studentId
          );
          if (unsyncedAlerts.length > 0) {
            syncScansWithLiveBilling(unsyncedAlerts);
          }
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
  }, [
    isEnabled,
    announceIncomingScan,
    applyBillingInfoToScan,
    ingestDirectScanResult,
    isAlertDismissed,
    loadBranchPersistenceFromStorage,
    openLessonId,
    isDrawerOpen,
    saveJournalToStorage,
    syncScansWithLiveBilling,
  ]);

  // Background heartbeat to automatically finalize and save attendance when lessons are up
  useEffect(() => {
    const runAutoSave = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch("/api/attendance/auto-save", { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.totalSaved > 0) {
            notifyAttendanceChanged({ source: "auto-save" });
          }
        })
        .catch(() => {
          // Tolerated background heartbeat
        });
    };
    const initialTimeout = setTimeout(runAutoSave, 4000);
    const autoSaveInterval = setInterval(runAutoSave, 60000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(autoSaveInterval);
    };
  }, []);

  // Dismiss only the popup card (X on HUD or Navbar popover) without deleting from Journal,
  // and permanently mark it dismissed so polling never re-opens it unless the student scans again!
  const handleDismissPopup = useCallback(
    async (scanId: number) => {
      const targetAlert =
        pinnedAlerts.find((a) => a.id === scanId) ||
        recentScans.find((s) => s.id === scanId);

      dismissedAlertIdsRef.current.add(scanId);
      if (targetAlert?.studentId) {
        const prevMax =
          dismissedStudentMaxScanIdRef.current.get(targetAlert.studentId) ?? 0;
        dismissedStudentMaxScanIdRef.current.set(
          targetAlert.studentId,
          Math.max(prevMax, scanId)
        );
      }
      saveDismissedAlertsToStorage();

      setPinnedAlerts((prev) =>
        prev.filter(
          (a) =>
            a.id !== scanId &&
            !(
              targetAlert?.studentId &&
              a.studentId === targetAlert.studentId &&
              a.id <= scanId
            )
        )
      );

      setRecentScans((prev) => {
        const nextList = prev.map((s) =>
          s.id === scanId ? { ...s, isResolved: true } : s
        );
        saveJournalToStorage(nextList);
        return nextList;
      });

      // Mark isResolved = true in DB without deleting the row from BiometricScanLog
      // and without marking attendance PRESENT
      await resolveBiometricAlertAction({
        scanId,
        mode: "RESOLVED_BY_CATCHUP",
      });
    },
    [
      pinnedAlerts,
      recentScans,
      saveDismissedAlertsToStorage,
      saveJournalToStorage,
    ]
  );

  // Resolve or dismiss a pinned alert or journal entry
  const handleResolveAlert = useCallback(
    async (
      scanId: number,
      mode: "DISMISS" | "ALLOW_PRESENT" | "RESOLVED_BY_PAYMENT" | "RESOLVED_BY_CATCHUP"
    ) => {
      const targetAlert =
        pinnedAlerts.find((a) => a.id === scanId) ||
        recentScans.find((s) => s.id === scanId);

      dismissedAlertIdsRef.current.add(scanId);
      if (targetAlert?.studentId) {
        const prevMax =
          dismissedStudentMaxScanIdRef.current.get(targetAlert.studentId) ?? 0;
        dismissedStudentMaxScanIdRef.current.set(
          targetAlert.studentId,
          Math.max(prevMax, scanId)
        );
      }
      saveDismissedAlertsToStorage();

      setPinnedAlerts((prev) =>
        prev.filter(
          (a) =>
            a.id !== scanId &&
            !(
              targetAlert?.studentId &&
              a.studentId === targetAlert.studentId &&
              a.id <= scanId
            )
        )
      );

      if (mode === "DISMISS") {
        removedJournalIdsRef.current.add(scanId);
        saveRemovedJournalIdsToStorage();
        setRecentScans((prev) => {
          const nextList = prev.filter((s) => s.id !== scanId);
          saveJournalToStorage(nextList);
          return nextList;
        });
      } else {
        setRecentScans((prev) => {
          const nextList = prev.map((s) =>
            s.id === scanId
              ? {
                  ...s,
                  isResolved: true,
                  status:
                    mode === "ALLOW_PRESENT" || mode === "RESOLVED_BY_PAYMENT"
                      ? ("SUCCESS" as const)
                      : s.status,
                }
              : s
          );
          saveJournalToStorage(nextList);
          return nextList;
        });
      }

      const res = await resolveBiometricAlertAction({ scanId, mode });
      if (
        res.success &&
        (mode === "ALLOW_PRESENT" || mode === "RESOLVED_BY_PAYMENT")
      ) {
        toast.success(res.message);
        if (targetAlert && targetAlert.studentId) {
          await syncScansWithLiveBilling([
            {
              ...targetAlert,
              isResolved: true,
              status: "SUCCESS",
            },
          ]);
        }
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
    [
      pinnedAlerts,
      recentScans,
      openLessonId,
      router,
      saveDismissedAlertsToStorage,
      saveJournalToStorage,
      saveRemovedJournalIdsToStorage,
      syncScansWithLiveBilling,
    ]
  );

  // Clear the entire journal with 1 click so nothing stays stuck
  const handleClearJournal = useCallback(async () => {
    const maxId = Math.max(
      lastSeenIdRef.current,
      ...recentScans.map((s) => s.id),
      ...pinnedAlerts.map((a) => a.id),
      0
    );
    clearedBeforeIdRef.current = maxId;
    if (typeof window !== "undefined") {
      const suffix = getBranchStorageSuffix();
      try {
        localStorage.setItem(
          `massinissa_biometric_cleared_before_id_v1_${suffix}`,
          String(maxId)
        );
        localStorage.removeItem(`massinissa_biometric_journal_v1_${suffix}`);
      } catch {
        // ignore
      }
    }
    setRecentScans([]);
    setPinnedAlerts([]);
    setLiveStreamCard(null);
    const res = await clearBiometricJournalAction({ onlyResolved: false });
    if (res.success) {
      toast.info(
        isAr ? "تم مسح السجل بنجاح" : "Journal vidé avec succès"
      );
    }
  }, [getBranchStorageSuffix, isAr, pinnedAlerts, recentScans]);

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
  const openCatchUpModalForScan = useCallback(async (scan: BiometricScanDisplayItem) => {
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
        dismissedAlertIdsRef.current.add(catchUpTargetScan.id);
        if (catchUpTargetScan.studentId) {
          const prevMax =
            dismissedStudentMaxScanIdRef.current.get(
              catchUpTargetScan.studentId
            ) ?? 0;
          dismissedStudentMaxScanIdRef.current.set(
            catchUpTargetScan.studentId,
            Math.max(prevMax, catchUpTargetScan.id)
          );
        }
        saveDismissedAlertsToStorage();
        setPinnedAlerts((prev) =>
          prev.filter((a) => a.id !== catchUpTargetScan.id)
        );
        const updatedScan: BiometricScanDisplayItem = {
          ...catchUpTargetScan,
          isResolved: true,
          status: "SUCCESS",
          lessonId: Number(selectedCatchUpLessonId),
        };
        setRecentScans((prev) => {
          const nextList = prev.map((s) =>
            s.id === catchUpTargetScan.id ? updatedScan : s
          );
          saveJournalToStorage(nextList);
          return nextList;
        });
        setCatchUpTargetScan(null);
        await syncScansWithLiveBilling([updatedScan]);
        notifyAttendanceChanged({
          lessonId: Number(selectedCatchUpLessonId),
          source: "biometric-catchup",
        });
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsSavingCatchUp(false);
    }
  };

  // Open Payment modal for a State 2 card
  const openPaymentModalForScan = useCallback(
    async (scan: BiometricScanDisplayItem) => {
      if (!scan.studentId) return;
      const targetClassId = scan.classId ?? scan.resolvedClassId ?? null;
      setPaymentTargetScan(scan);
      setPaymentLoading(true);
      setPaymentData(null);
      setSelectedPaymentClassId(targetClassId ? String(targetClassId) : "");

      try {
        const res = await getBiometricPaymentDataAction(
          scan.studentId,
          targetClassId
        );
        if (res.success && res.student && res.classData) {
          setPaymentData({
            student: res.student,
            classData: res.classData,
            availableClasses: res.availableClasses || [],
            defaultInscriptionFee: res.defaultInscriptionFee ?? 1000,
          });
          setSelectedPaymentClassId(String(res.classData.id));
        } else {
          toast.error(
            res.message ||
              (isAr
                ? "تعذر تحميل بيانات الدفع"
                : "Impossible de charger les données de paiement")
          );
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur de chargement");
      } finally {
        setPaymentLoading(false);
      }
    },
    [isAr]
  );

  const handleSelectPaymentClass = (newClassId: string) => {
    setSelectedPaymentClassId(newClassId);
    if (paymentData?.availableClasses) {
      const found = paymentData.availableClasses.find(
        (c: any) => String(c.id) === newClassId
      );
      if (found) {
        setPaymentData((prev) =>
          prev ? { ...prev, classData: found } : null
        );
      }
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
        const matchClass = (s.className || s.resolvedClassName)
          ?.toLowerCase()
          .includes(q);
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
        handleDismissPopup,
        handleClearJournal,
        handleSyncK50Devices,
        openCatchUpModalForScan,
        openPaymentModalForScan,
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
                const exactAlertCredits =
                  alert.isSiblingWaived && alert.payerRemainingCredit != null
                    ? Number(alert.payerRemainingCredit)
                    : Number(alert.remainingCredits ?? 0);

                if (alert.status === "NO_CREDITS") {
                  // STATE 2: LIGHT APPLICATION CARD WITH RED ACCENT (INSUFFICIENT / 0 / NEGATIVE CREDITS)
                  return (
                    <div
                      key={alert.id}
                      className="rounded-xl bg-white text-gray-800 border border-red-200 border-s-4 border-s-red-500 shadow-lg p-3.5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <BiometricStatusDot variant="danger" />
                          <span className="text-xs font-semibold text-red-700">
                            {alert.isFormation
                              ? isAr
                                ? "تنبيه : مستحقات التكوين غير مسددة"
                                : "Alerte : Formation non payée"
                              : isAr
                              ? `تنبيه : الرصيد غير كافٍ (${exactAlertCredits} حصص)`
                              : `Solde insuffisant (${exactAlertCredits} séance(s))`}
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
                            onClick={() => handleDismissPopup(alert.id)}
                            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                            title={isAr ? "إغلاق" : "Fermer"}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="font-semibold text-sm text-gray-900 flex items-center justify-between gap-2 min-w-0">
                          {alert.studentId ? (
                            <Link
                              href={`/list/students/${alert.studentId}`}
                              className="flex items-center gap-1.5 min-w-0 truncate hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                              title={
                                isAr
                                  ? "فتح الملف الشخصي للتلميذ"
                                  : "Ouvrir le profil de l'étudiant"
                              }
                            >
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{alert.studentName}</span>
                              <span className="text-gray-500 font-mono text-xs shrink-0">
                                (#{alert.globalNumber})
                              </span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{alert.studentName}</span>
                              <span className="text-gray-500 font-mono text-xs shrink-0">
                                (#{alert.globalNumber})
                              </span>
                            </div>
                          )}
                          <InscriptionStatusBadge
                            status={alert.inscriptionStatus}
                            isAr={isAr}
                          />
                        </div>

                        <div className="text-gray-600 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {(alert.className || alert.resolvedClassName) && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="font-medium text-gray-800 truncate">
                                {alert.className || alert.resolvedClassName}
                              </span>
                            </span>
                          )}
                          {alert.classroomName && (
                            <span className="inline-flex items-center gap-1 text-gray-500 shrink-0">
                              <DoorOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>{alert.classroomName}</span>
                            </span>
                          )}
                          {alert.lessonStartsAt && (
                            <span className="font-mono text-gray-500 shrink-0" dir="ltr">
                              ({formatShortTime(alert.lessonStartsAt)} -{" "}
                              {formatShortTime(alert.lessonEndsAt)})
                            </span>
                          )}
                        </div>

                        <BiometricGroupAndPaymentBadges
                          scan={alert}
                          isAr={isAr}
                        />

                        <div className="pt-0.5 flex flex-wrap items-center justify-between gap-1.5">
                          <BiometricRemainingLessonsBadge
                            scan={alert}
                            isAr={isAr}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => openPaymentModalForScan(alert)}
                          className="flex-1 py-1.5 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors whitespace-nowrap shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isAr ? "تسديد الآن" : "Encaisser maintenant"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleResolveAlert(alert.id, "ALLOW_PRESENT")
                          }
                          className="py-1.5 px-3 rounded-md bg-white hover:bg-gray-50 text-gray-700 font-medium text-xs flex items-center justify-center gap-1.5 border border-gray-300 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                          <span>
                            {isAr ? "سماح استثنائي" : "Autoriser présence"}
                          </span>
                        </button>
                        {alert.studentId && (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/list/students/${alert.studentId}`)
                            }
                            className="p-1.5 rounded-md bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 border border-gray-300 cursor-pointer transition-colors shrink-0"
                            title={isAr ? "الملف الشخصي" : "Profil"}
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        )}
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
                          onClick={() => handleDismissPopup(alert.id)}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                          title={isAr ? "إغلاق" : "Fermer"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="font-semibold text-sm text-gray-900 flex items-center justify-between gap-2 min-w-0">
                        {alert.studentId ? (
                          <Link
                            href={`/list/students/${alert.studentId}`}
                            className="flex items-center gap-1.5 min-w-0 truncate hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                            title={
                              isAr
                                ? "فتح الملف الشخصي للتلميذ"
                                : "Ouvrir le profil de l'étudiant"
                            }
                          >
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{alert.studentName}</span>
                            <span className="text-emerald-600 font-mono text-xs shrink-0">
                              (#{alert.globalNumber})
                            </span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{alert.studentName}</span>
                            <span className="text-emerald-600 font-mono text-xs shrink-0">
                              (#{alert.globalNumber})
                            </span>
                          </div>
                        )}
                        <InscriptionStatusBadge
                          status={alert.inscriptionStatus}
                          isAr={isAr}
                        />
                      </div>

                      {(alert.className || alert.resolvedClassName) && (
                        <div className="text-gray-600 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-800 truncate">
                            {alert.className || alert.resolvedClassName}
                          </span>
                        </div>
                      )}

                      <BiometricGroupAndPaymentBadges
                        scan={alert}
                        isAr={isAr}
                      />

                      <div className="pt-0.5">
                        <BiometricRemainingLessonsBadge
                          scan={alert}
                          isAr={isAr}
                        />
                      </div>

                      <p className="text-gray-600">
                        {isAr
                          ? "التلميذ غير مسجل في أي فوج يدرس في هذا التوقيت."
                          : "Inscrit dans aucun groupe ayant cours dans ce créneau."}
                      </p>
                      {alert.nextLessonInfo &&
                        !alert.nextLessonInfo.startsWith("INSC_") && (
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
                        className="flex-1 py-1.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5 shrink-0" />
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
                          className="py-1.5 px-3 rounded-md bg-white hover:bg-gray-50 text-gray-700 font-medium text-xs flex items-center justify-center gap-1.5 border border-gray-300 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />
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
                        {liveStreamCard.isPendingVerification
                          ? isAr
                            ? "تم قراءة البصمة — جاري التحقق..."
                            : "Empreinte lue — Vérification..."
                          : liveStreamCard.alreadyPresent
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
                    <div className="font-semibold text-sm text-gray-900 flex items-center justify-between gap-2 min-w-0">
                      {liveStreamCard.studentId ? (
                        <Link
                          href={`/list/students/${liveStreamCard.studentId}`}
                          className="flex items-center gap-1.5 min-w-0 truncate hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                          title={
                            isAr
                              ? "فتح الملف الشخصي للتلميذ"
                              : "Ouvrir le profil de l'étudiant"
                          }
                        >
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{liveStreamCard.studentName}</span>
                          <span className="text-emerald-600 font-mono text-xs shrink-0">
                            (#{liveStreamCard.globalNumber})
                          </span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{liveStreamCard.studentName}</span>
                          <span className="text-emerald-600 font-mono text-xs shrink-0">
                            (#{liveStreamCard.globalNumber})
                          </span>
                        </div>
                      )}
                      <InscriptionStatusBadge
                        status={liveStreamCard.inscriptionStatus}
                        isAr={isAr}
                      />
                    </div>
                    <div className="text-gray-600 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {(liveStreamCard.className ||
                        liveStreamCard.resolvedClassName) && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-800 truncate">
                            {liveStreamCard.className ||
                              liveStreamCard.resolvedClassName}
                          </span>
                        </span>
                      )}
                      {liveStreamCard.classroomName && (
                        <span className="inline-flex items-center gap-1 text-gray-500 shrink-0">
                          <DoorOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{liveStreamCard.classroomName}</span>
                        </span>
                      )}
                      {liveStreamCard.lessonStartsAt && (
                        <span className="font-mono text-gray-500 shrink-0" dir="ltr">
                          ({formatShortTime(liveStreamCard.lessonStartsAt)} -{" "}
                          {formatShortTime(liveStreamCard.lessonEndsAt)})
                        </span>
                      )}
                    </div>

                    {!liveStreamCard.isPendingVerification && (
                      <>
                        <BiometricGroupAndPaymentBadges
                          scan={liveStreamCard}
                          isAr={isAr}
                        />

                        <div className="pt-1 flex flex-wrap items-center justify-between gap-1.5">
                          <BiometricRemainingLessonsBadge
                            scan={liveStreamCard}
                            isAr={isAr}
                          />
                        </div>
                      </>
                    )}
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
                      ? `${recentScans.length} عملية مسح محفوظة`
                      : `${recentScans.length} pointage(s) enregistré(s)`}
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
                filteredDrawerScans.map((scan) => {
                  const exactScanCredits =
                    scan.isSiblingWaived && scan.payerRemainingCredit != null
                      ? Number(scan.payerRemainingCredit)
                      : Number(scan.remainingCredits ?? 0);

                  return (
                    <div
                      key={scan.id}
                      className={`rounded-xl p-3 border text-xs bg-white shadow-2xs transition-all space-y-1.5 ${
                        scan.status === "SUCCESS"
                          ? "border-gray-200 border-s-4 border-s-emerald-500"
                          : scan.status === "NO_CREDITS"
                          ? "border-red-200 border-s-4 border-s-red-500"
                          : scan.status === "NO_UPCOMING_GROUP"
                          ? "border-amber-200 border-s-4 border-s-amber-500"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
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
                              ? scan.isFormation
                                ? isAr
                                  ? "تكوين غير مسدد"
                                  : "Formation impayée"
                                : isAr
                                ? `بدون رصيد (${exactScanCredits})`
                                : `Solde (${exactScanCredits})`
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
                        <div className="font-semibold text-gray-900 flex items-center justify-between gap-2 min-w-0">
                          {scan.studentId ? (
                            <Link
                              href={`/list/students/${scan.studentId}`}
                              onClick={() => setIsDrawerOpen(false)}
                              className="flex items-center gap-1.5 min-w-0 truncate hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                              title={
                                isAr
                                  ? "فتح الملف الشخصي للتلميذ"
                                  : "Ouvrir le profil de l'étudiant"
                              }
                            >
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{scan.studentName}</span>
                              <span className="text-gray-500 font-mono text-[11px] shrink-0">
                                (#{scan.globalNumber})
                              </span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{scan.studentName}</span>
                              <span className="text-gray-500 font-mono text-[11px] shrink-0">
                                (#{scan.globalNumber})
                              </span>
                            </div>
                          )}
                          <InscriptionStatusBadge
                            status={scan.inscriptionStatus}
                            isAr={isAr}
                          />
                        </div>
                      ) : (
                        <div className="font-medium text-gray-500">
                          {isAr
                            ? "بصمة غير مسجلة في النظام"
                            : "Empreinte non enregistrée"}
                        </div>
                      )}

                      {(scan.className || scan.resolvedClassName) && (
                        <div className="text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-800">
                              {scan.className || scan.resolvedClassName}
                            </span>
                          </span>
                          {scan.classroomName && (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <DoorOpen className="w-3 h-3 text-gray-400 shrink-0" />
                              <span>{scan.classroomName}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {scan.studentId && (
                        <>
                          <BiometricGroupAndPaymentBadges
                            scan={scan}
                            isAr={isAr}
                            compact
                          />
                          <div className="pt-0.5">
                            <BiometricRemainingLessonsBadge
                              scan={scan}
                              isAr={isAr}
                              compact
                            />
                          </div>
                        </>
                      )}

                      {/* Quick Action Buttons in Drawer */}
                      {scan.status === "NO_CREDITS" && !scan.isResolved && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                          {scan.studentId && (
                            <button
                              type="button"
                              onClick={() => {
                                openPaymentModalForScan(scan);
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
                          {scan.studentId && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsDrawerOpen(false);
                                router.push(`/list/students/${scan.studentId}`);
                              }}
                              className="p-1 rounded-md bg-white hover:bg-gray-50 border border-gray-300 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
                              title={isAr ? "الملف الشخصي" : "Profil"}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
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
                  );
                })
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
                {catchUpTargetScan.studentId ? (
                  <Link
                    href={`/list/students/${catchUpTargetScan.studentId}`}
                    onClick={() => setCatchUpTargetScan(null)}
                    className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1.5 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span>
                      {catchUpTargetScan.studentName} (#
                      {catchUpTargetScan.globalNumber})
                    </span>
                  </Link>
                ) : (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span>
                      {catchUpTargetScan.studentName} (#
                      {catchUpTargetScan.globalNumber})
                    </span>
                  </p>
                )}
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
      {/* ===================================================================== */}
      {/* ONE-CLICK PAYMENT MODAL FOR STATE 2 (NO CREDITS) SCANS                */}
      {/* ===================================================================== */}
      {paymentTargetScan && (
        <div
          dir={isAr ? "rtl" : "ltr"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs pointer-events-auto"
          onClick={() => {
            if (!paymentLoading) setPaymentTargetScan(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto border border-gray-200 relative text-start"
          >
            <button
              type="button"
              onClick={() => setPaymentTargetScan(null)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg z-20 cursor-pointer transition-colors"
              title={isAr ? "إغلاق" : "Fermer"}
            >
              <X className="w-4 h-4" />
            </button>

            {paymentLoading ? (
              <div className="p-10 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                <span className="text-sm text-gray-600 font-medium">
                  {isAr
                    ? "جاري تحميل بيانات الدفع..."
                    : "Chargement des données de paiement..."}
                </span>
              </div>
            ) : paymentData && paymentData.classData ? (
              <div className="p-1">
                {/* Optional Class Selector if student has multiple enrolled classes */}
                {paymentData.availableClasses &&
                  paymentData.availableClasses.length > 1 && (
                    <div className="px-5 pt-4 pb-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {isAr
                          ? "اختر الفوج المستهدف للوصل:"
                          : "Groupe cible pour le paiement :"}
                      </label>
                      <select
                        value={selectedPaymentClassId}
                        onChange={(e) =>
                          handleSelectPaymentClass(e.target.value)
                        }
                        className="w-full text-xs rounded-lg border border-gray-300 p-2 bg-white text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        {paymentData.availableClasses.map((cls: any) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name} ({cls.branch?.name || ""}) -{" "}
                            {formatDZD(cls.pricePerCycle, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                <PaymentForm
                  student={paymentData.student}
                  classData={paymentData.classData}
                  setOpen={(open) => {
                    if (!open) {
                      setPaymentTargetScan(null);
                    }
                  }}
                  type="create"
                  defaultInscriptionFee={paymentData.defaultInscriptionFee}
                  onSuccess={async () => {
                    if (paymentTargetScan?.id) {
                      await handleResolveAlert(
                        paymentTargetScan.id,
                        "RESOLVED_BY_PAYMENT"
                      );
                    }
                  }}
                />
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-gray-800">
                  {isAr
                    ? "تعذر العثور على بيانات الفوج أو التسجيل لهذا التلميذ."
                    : "Impossible de charger les données du groupe ou de l'étudiant."}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const stId = paymentTargetScan.studentId;
                      setPaymentTargetScan(null);
                      if (stId) router.push(`/list/students/${stId}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>
                      {isAr ? "فتح ملف التلميذ" : "Ouvrir la fiche de l'élève"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </BiometricMonitorContext.Provider>
  );
}
