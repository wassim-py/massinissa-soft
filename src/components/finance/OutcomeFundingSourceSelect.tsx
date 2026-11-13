"use client";

import React from "react";
import { Wallet } from "lucide-react";
import {
  OUTCOME_FUNDING_SOURCES,
  getOutcomeFundingSourceMeta,
  normalizeOutcomeFundingSource,
  type OutcomeFundingSource,
} from "@/lib/financeConstants";
import { Badge } from "@/components/ui/Badge";

interface OutcomeFundingSourceSelectProps {
  value?: string | null;
  onChange: (value: OutcomeFundingSource) => void;
  locale?: string;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
}

/**
 * Shared dropdown selector for tagging every financial outcome with its origin:
 * School Month Benefice, Inscription Fees, or Caisse Noire.
 */
export function OutcomeFundingSourceSelect({
  value,
  onChange,
  locale = "fr",
  label,
  helperText,
  disabled = false,
  required = true,
  id,
  className = "",
}: OutcomeFundingSourceSelectProps) {
  const isAr = locale === "ar";
  const normalized = normalizeOutcomeFundingSource(value);
  const activeMeta = getOutcomeFundingSourceMeta(normalized, locale);

  const defaultLabel = isAr ? "مصدر التمويل (الصندوق)" : "Source de financement";
  const defaultHelper =
    normalized === "CAISSE_NOIRE"
      ? isAr
        ? "سيتم تسجيل خصم تلقائي في الصندوق الأسود (Caisse Noire)."
        : "Un retrait équivalent sera automatiquement enregistré dans la Caisse Noire."
      : normalized === "INSCRIPTION_FEES"
        ? isAr
          ? "سيتم احتساب هذا المصروف من رسوم التسجيل."
          : "Cette sortie sera déduite des frais d'inscription."
        : isAr
          ? "سيتم احتساب هذا المصروف من أرباح الشهر المدرسي."
          : "Cette sortie sera déduite du bénéfice mensuel de l'école.";

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5"
      >
        <Wallet className="w-3.5 h-3.5 text-slate-500" />
        <span>{label || defaultLabel}</span>
        {required && <span className="text-rose-500">*</span>}
      </label>
      <select
        id={id}
        value={normalized}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(normalizeOutcomeFundingSource(e.target.value))}
        className="w-full px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors disabled:opacity-60"
      >
        {OUTCOME_FUNDING_SOURCES.map((src) => {
          const meta = getOutcomeFundingSourceMeta(src, locale);
          return (
            <option key={src} value={src}>
              {meta.label}
            </option>
          );
        })}
      </select>
      <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-500">{helperText || defaultHelper}</p>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${activeMeta.pillClass}`}
        >
          {activeMeta.shortLabel}
        </span>
      </div>
    </div>
  );
}

interface FundingSourceBadgeProps {
  source?: string | null;
  locale?: string;
  compact?: boolean;
}

/**
 * Displays a standardized colored badge for an outcome's funding source.
 */
export function FundingSourceBadge({
  source,
  locale = "fr",
  compact = false,
}: FundingSourceBadgeProps) {
  const meta = getOutcomeFundingSourceMeta(source, locale);
  return (
    <Badge variant={meta.badgeVariant} className="whitespace-nowrap">
      {compact ? meta.shortLabel : meta.label}
    </Badge>
  );
}
