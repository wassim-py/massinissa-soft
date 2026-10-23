"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";

function formatToDDMMYYYY(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "dd/mm/yyyy";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

const AttendanceGridFilters = () => {
  const t = useTranslations("attendance");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // This function handles changes from either date input
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams);
    const { name, value } = e.target;

    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }

    // Automatically apply the filter by updating the URL
    replace(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    const params = new URLSearchParams(searchParams);
    // Explicitly remove all date-related filters
    params.delete("startDate");
    params.delete("endDate");
    params.delete("date"); // Also reset the main calendar filter
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border mb-6 font-sans">
      <div className="flex items-center gap-2">
        <label htmlFor="startDate" className="text-sm font-medium text-gray-700">{t("filterFrom")}</label>
        <div className="relative flex items-center gap-2 px-3 py-2 bg-white border rounded-md text-sm cursor-pointer hover:border-blue-500 transition-colors">
          <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
          <span className={`font-mono text-sm select-none ${startDate ? "text-gray-800" : "text-gray-400"}`} dir="ltr">
            {formatToDDMMYYYY(startDate)}
          </span>
          <input
            type="date"
            id="startDate"
            name="startDate"
            value={startDate}
            onChange={handleDateChange}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {}
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="endDate" className="text-sm font-medium text-gray-700">{t("filterTo")}</label>
        <div className="relative flex items-center gap-2 px-3 py-2 bg-white border rounded-md text-sm cursor-pointer hover:border-blue-500 transition-colors">
          <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
          <span className={`font-mono text-sm select-none ${endDate ? "text-gray-800" : "text-gray-400"}`} dir="ltr">
            {formatToDDMMYYYY(endDate)}
          </span>
          <input
            type="date"
            id="endDate"
            name="endDate"
            value={endDate}
            onChange={handleDateChange}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {}
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
      <button
        onClick={handleReset}
        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-gray-300 hover:text-gray-800 transition-colors"
      >
        {t("resetFilters")}
      </button>
    </div>
  );
};

export default AttendanceGridFilters;
