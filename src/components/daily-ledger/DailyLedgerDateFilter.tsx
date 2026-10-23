"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";

function formatToDDMMYYYY(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export default function DailyLedgerDateFilter({ currentDate }: { currentDate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleDateChange = (newDate: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (newDate) {
      current.set("date", newDate);
    } else {
      current.delete("date");
    }
    current.delete("page");
    router.push(`${pathname}?${current.toString()}`);
  };

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold text-gray-800 shadow-xs hover:border-primary/50 transition-colors cursor-pointer">
      <Calendar className="w-4 h-4 text-primary shrink-0" />
      <span className="text-xs font-mono text-gray-800 select-none" dir="ltr">
        {formatToDDMMYYYY(currentDate)}
      </span>
      <input
        type="date"
        value={currentDate}
        onChange={(e) => handleDateChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Fallback for browsers without showPicker
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Select date (dd/mm/yyyy)"
      />
    </div>
  );
}
