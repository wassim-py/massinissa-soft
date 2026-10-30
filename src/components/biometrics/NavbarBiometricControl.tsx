"use client";

import React, { useState, useRef } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Fingerprint,
  ClipboardList,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Check,
  BookOpen,
  User,
  X,
} from "lucide-react";
import { useBiometricMonitor } from "./BiometricMonitorProvider";

export default function NavbarBiometricControl() {
  const locale = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();

  const {
    isEnabled,
    setIsEnabled,
    setIsDrawerOpen,
    recentScans,
    pinnedAlerts,
    handleResolveAlert,
    openCatchUpModalForScan,
    openPaymentModalForScan,
  } = useBiometricMonitor();

  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const unpaidAlerts = pinnedAlerts.filter((a) => a.status === "NO_CREDITS");
  const allPendingAlerts = pinnedAlerts;

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHoverOpen(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHoverOpen(false);
    }, 220);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    });

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="flex items-center gap-1.5 sm:gap-2"
    >
      {/* 1. ON / OFF Background Monitor Toggle */}
      <button
        type="button"
        onClick={() => setIsEnabled(!isEnabled)}
        className="w-9 h-9 sm:w-auto sm:px-3 sm:py-1.5 rounded-full sm:rounded-md flex items-center justify-center sm:justify-start gap-2 border border-gray-200 sm:border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-medium text-gray-700 shadow-xs transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 shrink-0 relative"
        title={
          isEnabled
            ? isAr
              ? "قارئ البصمة مفعل في الخلفية (اضغط للإيقاف)"
              : "Lecteur d'empreinte actif en arrière-plan (cliquer pour désactiver)"
            : isAr
            ? "قارئ البصمة متوقف (اضغط للتفعيل)"
            : "Lecteur d'empreinte désactivé (cliquer pour activer)"
        }
      >
        {/* Mobile status indicator */}
        <span className="sm:hidden absolute top-1 right-1 rtl:right-auto rtl:left-1 flex h-2 w-2">
          {isEnabled && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isEnabled ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
        </span>

        {/* Desktop status indicator */}
        <span className="hidden sm:flex relative h-2.5 w-2.5 shrink-0">
          {isEnabled && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isEnabled ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
        </span>

        <Fingerprint className="w-4 h-4 text-gray-700 sm:text-gray-600 shrink-0" />
        <span className="hidden md:inline font-semibold text-gray-800">
          {isAr ? "البصمة" : "Empreinte"}
        </span>
        <span
          className={`hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
            isEnabled
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-gray-100 text-gray-600 border-gray-200"
          }`}
        >
          {isEnabled ? "ON" : "OFF"}
        </span>
      </button>

      {/* 2. Journal Drawer Trigger Button */}
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        className="w-9 h-9 sm:w-auto sm:px-3 sm:py-1.5 rounded-full sm:rounded-md flex items-center justify-center sm:justify-start gap-1.5 border border-gray-200 sm:border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-medium text-gray-700 shadow-xs transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 shrink-0 relative"
        title={
          isAr
            ? "فتح سجل الحضور بالبصمة المباشر"
            : "Ouvrir le journal biométrique en direct"
        }
      >
        <ClipboardList className="w-4 h-4 text-gray-700 sm:text-gray-600 shrink-0" />
        <span className="hidden lg:inline font-semibold text-gray-800">
          {isAr ? "السجل" : "Journal"}
        </span>
        {recentScans.length > 0 && (
          <>
            <span className="sm:hidden absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto px-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white font-bold text-[9px] flex items-center justify-center border border-white shadow-xs">
              {recentScans.length > 99 ? "99+" : recentScans.length}
            </span>
            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[10px] leading-none">
              {recentScans.length}
            </span>
          </>
        )}
      </button>

      {/* 3. Unpaid / Pending Alert Counter Badge with Instant Hover Popover (§7.1) */}
      {allPendingAlerts.length > 0 && (
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="w-9 h-9 sm:w-auto sm:px-3 sm:py-1.5 rounded-full sm:rounded-md flex items-center justify-center sm:justify-start gap-2 border border-red-200 bg-red-50 hover:bg-red-100 active:bg-red-200 text-xs font-semibold text-red-700 shadow-xs cursor-pointer transition-colors shrink-0 relative"
            title={
              unpaidAlerts.length > 0
                ? isAr
                  ? `${unpaidAlerts.length} غير مدفوع`
                  : `${unpaidAlerts.length} Impayé(s)`
                : isAr
                ? `${allPendingAlerts.length} تنبيه`
                : `${allPendingAlerts.length} Alerte(s)`
            }
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 sm:hidden" />
            <span className="hidden sm:flex relative h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
            </span>
            <span className="hidden sm:inline">
              {unpaidAlerts.length > 0
                ? isAr
                  ? `${unpaidAlerts.length} غير مدفوع`
                  : `${unpaidAlerts.length} Impayé(s)`
                : isAr
                ? `${allPendingAlerts.length} تنبيه`
                : `${allPendingAlerts.length} Alerte(s)`}
            </span>
            <span className="sm:hidden absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex items-center justify-center px-1 min-w-[16px] h-4 text-[9px] font-bold text-white bg-red-600 rounded-full border border-white shadow-xs">
                {allPendingAlerts.length > 99 ? "99+" : allPendingAlerts.length}
              </span>
            </span>
          </button>

          {/* HOVER POPOVER: Shows Student Names & Group Names Immediately on Hover */}
          {isHoverOpen && (
            <div
              dir={isAr ? "rtl" : "ltr"}
              className={`absolute top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] rounded-xl bg-white border border-gray-200 shadow-xl z-50 p-3 text-xs ${
                isAr ? "left-0" : "right-0"
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>
                    {isAr
                      ? `تلاميذ قيد الانتظار (${allPendingAlerts.length})`
                      : `Étudiants en attente (${allPendingAlerts.length})`}
                  </span>
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {allPendingAlerts.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/60 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0 truncate">
                        {item.status === "NO_CREDITS" ? (
                          <span className="inline-flex h-2 w-2 rounded-full bg-red-600 shrink-0" />
                        ) : (
                          <span className="inline-flex h-2 w-2 rounded-full biometric-dot-green-red shrink-0" />
                        )}
                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{item.studentName || "—"}</span>
                        <span className="text-gray-500 font-mono text-[11px] shrink-0">
                          (#{item.globalNumber})
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.inscriptionStatus === "UNPAID" ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                            {isAr ? "تسجيل غير مدفوع" : "Inscr. Impayée"}
                          </span>
                        ) : item.inscriptionStatus === "PAID" ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            {isAr ? "تسجيل مدفوع" : "Inscr. Payée"}
                          </span>
                        ) : item.inscriptionStatus === "WAIVED" ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                            {isAr ? "تسجيل معفى" : "Inscr. Exonérée"}
                          </span>
                        ) : null}
                        <span
                          className="text-[10px] font-mono text-gray-400"
                          dir="ltr"
                        >
                          {formatTime(item.scannedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="text-gray-600 mt-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">
                          {item.className ||
                            (isAr
                              ? "خارج التوقيت (حصة تعويض)"
                              : "Hors créneau (Rattrapage)")}
                        </span>
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                          item.status === "NO_CREDITS"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {item.status === "NO_CREDITS"
                          ? isAr
                            ? "0 حصص"
                            : "0 séance"
                          : isAr
                          ? "تعويض"
                          : "Hors crén."}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-200/70">
                      {item.status === "NO_CREDITS" ? (
                        <>
                          {item.studentId && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsHoverOpen(false);
                                openPaymentModalForScan(item);
                              }}
                              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>{isAr ? "تسديد" : "Encaisser"}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleResolveAlert(item.id, "ALLOW_PRESENT")
                            }
                            className="px-2.5 py-1 rounded-md bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            <span>{isAr ? "سماح" : "Autoriser"}</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setIsHoverOpen(false);
                            openCatchUpModalForScan(item);
                          }}
                          className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{isAr ? "تعويض" : "Rattrapage"}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResolveAlert(item.id, "DISMISS")}
                        className="ms-auto p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 cursor-pointer transition-colors"
                        title={isAr ? "حذف" : "Supprimer"}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
