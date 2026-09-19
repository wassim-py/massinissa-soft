"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Check, AlertTriangle, BookOpen, Clock, Info, BookCheck } from "lucide-react";
import { useLocale } from "next-intl";

export type BookStudentStatus =
  | "PAID_AND_RECEIVED"
  | "PAID_NOT_RECEIVED"
  | "PARTIALLY_RECEIVED"
  | "UNPAID_RECEIVED"
  | "UNPAID_NOT_RECEIVED";

export interface BookDetailItem {
  id: number;
  title: string;
  received: boolean;
  receivedAt?: string | Date | null;
}

export interface BookStatusBadgeProps {
  status: BookStudentStatus;
  receivedCount?: number;
  totalBooks?: number;
  details?: BookDetailItem[];
  size?: "sm" | "md";
  className?: string;
  showDetailsPopover?: boolean;
}

export function computeBookStatus(hasPaid: boolean, receivedCount: number, totalBooks: number): BookStudentStatus {
  if (hasPaid) {
    if (totalBooks > 0 && receivedCount >= totalBooks) {
      return "PAID_AND_RECEIVED";
    }
    if (receivedCount > 0) {
      return "PARTIALLY_RECEIVED";
    }
    return "PAID_NOT_RECEIVED";
  } else {
    if (receivedCount > 0) {
      return "UNPAID_RECEIVED";
    }
    return "UNPAID_NOT_RECEIVED";
  }
}

export default function BookStatusBadge({
  status,
  receivedCount,
  totalBooks,
  details = [],
  size = "sm",
  className = "",
  showDetailsPopover = true,
}: BookStatusBadgeProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const formatDate = (date: string | Date) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString(isAr ? "ar-DZ" : "fr-FR", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return String(date);
    }
  };

  const getBadgeConfig = () => {
    switch (status) {
      case "PAID_AND_RECEIVED":
        return {
          variant: "success" as const,
          icon: <Check className="w-3 h-3 stroke-[2.5]" />,
          label:
            totalBooks !== undefined && totalBooks > 1
              ? isAr
                ? `مستلم بالكامل (${receivedCount}/${totalBooks})`
                : `Reçu complet (${receivedCount}/${totalBooks})`
              : isAr
              ? "مستلم بالكامل"
              : "Reçu complet",
          title: isAr
            ? "التلميذ سدد الرسوم واستلم جميع نسخ الكتب المقررة"
            : "L'élève a réglé les frais et a reçu tous les livres prévus.",
        };
      case "PAID_NOT_RECEIVED":
        return {
          variant: "warning" as const,
          icon: <AlertTriangle className="w-3 h-3 text-amber-600" />,
          label: isAr ? "مدفوع - لم يستلم" : "Payé - Non remis",
          title: isAr
            ? "التلميذ دفع رسوم الكتب لكنه لم يستلم النسخة بعد"
            : "L'élève a payé les frais de livres mais n'a pas encore reçu son exemplaire.",
        };
      case "PARTIALLY_RECEIVED":
        return {
          variant: "warning" as const,
          icon: <Clock className="w-3 h-3 text-amber-600" />,
          label: isAr
            ? `مستلم جزئياً (${receivedCount || 0}/${totalBooks || 0})`
            : `Reçu partiel (${receivedCount || 0}/${totalBooks || 0})`,
          title: isAr
            ? "التلميذ استلم بعض النسخ وما زالت لديه نسخ متبقية"
            : "L'élève a reçu une partie des livres prévus.",
        };
      case "UNPAID_RECEIVED":
        return {
          variant: "secondary" as const,
          icon: <Info className="w-3 h-3 text-purple-600" />,
          label:
            totalBooks !== undefined && totalBooks > 1
              ? isAr
                ? `مستلم (${receivedCount}/${totalBooks}) - غير مدفوع`
                : `Remis (${receivedCount}/${totalBooks}) - Non payé`
              : isAr
              ? "مستلم - غير مدفوع"
              : "Remis - Non payé",
          title: isAr
            ? "تم تسليم الكتاب للتلميذ ولكن لم يتم تسديد الرسوم بعد"
            : "Le livre a été remis à l'élève mais les frais ne sont pas encore réglés.",
        };
      case "UNPAID_NOT_RECEIVED":
      default:
        return {
          variant: "danger" as const,
          icon: null,
          label: isAr ? "غير مدفوع" : "Frais non payés",
          title: isAr
            ? "لم يتم دفع رسوم الكتب ولم يتم استلام أي نسخة"
            : "Frais non réglés et aucun livre remis.",
          withDot: true,
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => details.length > 0 && showDetailsPopover && setIsPopoverOpen(true)}
      onMouseLeave={() => setIsPopoverOpen(false)}
    >
      <Badge
        variant={config.variant}
        size={size}
        withDot={(config as any).withDot}
        title={config.title}
        className={`font-semibold cursor-default select-none shadow-2xs ${className}`}
      >
        <span className="flex items-center gap-1">
          {config.icon}
          <span>{config.label}</span>
        </span>
      </Badge>

      {/* Details popover on hover if details are provided */}
      {isPopoverOpen && details.length > 0 && (
        <div className="absolute z-50 bottom-full start-1/2 -translate-x-1/2 mb-2 w-60 p-2.5 bg-gray-900/95 text-white rounded-xl shadow-xl text-xs space-y-1.5 backdrop-blur-xs pointer-events-none animate-in fade-in zoom-in-95">
          <p className="font-bold text-[11px] text-gray-300 border-b border-gray-700/80 pb-1 flex items-center justify-between">
            <span>{isAr ? "تفاصيل نسخ الكتب" : "Détails des manuels"}</span>
            <span className="font-mono text-[10px]">
              {receivedCount ?? details.filter((d) => d.received).length}/{totalBooks ?? details.length}
            </span>
          </p>
          <div className="space-y-1">
            {details.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 text-[11px] py-0.5"
              >
                <span className="truncate max-w-[130px]">{item.title}</span>
                {item.received ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 text-[10px] shrink-0">
                    <Check className="w-3 h-3" />
                    <span>
                      {item.receivedAt ? formatDate(item.receivedAt) : isAr ? "مستلم" : "Remis"}
                    </span>
                  </span>
                ) : (
                  <span className="text-rose-400 font-medium text-[10px] shrink-0">
                    {isAr ? "لم يستلم" : "Non remis"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
