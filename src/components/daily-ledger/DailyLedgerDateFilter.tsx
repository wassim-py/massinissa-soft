"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";

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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold text-gray-800 shadow-xs">
      <Calendar className="w-4 h-4 text-primary shrink-0" />
      <input
        type="date"
        value={currentDate}
        onChange={(e) => handleDateChange(e.target.value)}
        className="bg-transparent border-none text-xs font-mono text-gray-800 focus:outline-none cursor-pointer"
      />
    </div>
  );
}
