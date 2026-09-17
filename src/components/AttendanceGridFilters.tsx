"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const AttendanceGridFilters = () => {
  const t = useTranslations("attendance");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

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
        <input
          type="date"
          id="startDate"
          name="startDate"
          value={searchParams.get("startDate") || ""}
          onChange={handleDateChange}
          className="p-2 border rounded-md text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="endDate" className="text-sm font-medium text-gray-700">{t("filterTo")}</label>
        <input
          type="date"
          id="endDate"
          name="endDate"
          defaultValue={searchParams.get("endDate") || ""}
          onChange={handleDateChange}
          className="p-2 border rounded-md text-sm"
        />
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
