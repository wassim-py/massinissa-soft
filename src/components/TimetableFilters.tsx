"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";

// Define simpler types that match the actual data being passed
type TeacherForFilter = {
  id: string;
  name: string;
  surname: string;
};

type ClassForFilter = {
  id: number;
  name: string;
};

type BranchForFilter = {
  id: number;
  name: string;
};

const TimetableFilters = ({
  teachers = [],
  classes = [],
  branches = [],
  defaultBranchId,
  currentWeekRange,
}: {
  teachers?: TeacherForFilter[];
  classes?: ClassForFilter[];
  branches?: BranchForFilter[];
  defaultBranchId?: number;
  currentWeekRange?: {
    start: Date;
    end: Date;
    offset: number;
  };
}) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const t = useTranslations("lessons");
  const locale = useLocale();

  const safeTeachers = Array.isArray(teachers) ? teachers : [];
  const safeBranches = Array.isArray(branches) ? branches : [];

  // --- START: State for the new custom teacher dropdown ---
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const teacherDropdownRef = useRef<HTMLDivElement>(null);
  // --- END: State for the new custom teacher dropdown ---

  const handleFilterChange = (
    value: string,
    filterName: string
  ) => {
    const params = new URLSearchParams(searchParams);
    if (filterName === "branchId") {
      if (value) {
        params.set("branchId", value);
      } else {
        params.delete("branchId");
      }
    } else {
      if (value && value !== "all") {
        params.set(filterName, value);
      } else {
        params.delete(filterName);
      }
    }
    replace(`${pathname}?${params.toString()}`);
  };

  const currentOffset = currentWeekRange?.offset ?? (searchParams.get("weekOffset") ? parseInt(searchParams.get("weekOffset")!, 10) : 0);

  const handleWeekChange = (newOffset: number) => {
    const params = new URLSearchParams(searchParams);
    if (newOffset === 0) {
      params.delete("weekOffset");
    } else {
      params.set("weekOffset", newOffset.toString());
    }
    replace(`${pathname}?${params.toString()}`);
  };

  // Effect to close the custom dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        teacherDropdownRef.current &&
        !teacherDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTeacherDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter teachers based on the search term
  const filteredTeachers = safeTeachers.filter((teacher) =>
    `${teacher.name} ${teacher.surname}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );
  
  const selectedTeacherId = searchParams.get("teacherId");
  const selectedTeacher = safeTeachers.find(t => t.id === selectedTeacherId);

  const selectedBranchParam = searchParams.get("branchId");
  const currentBranchValue =
    selectedBranchParam !== null
      ? selectedBranchParam
      : defaultBranchId !== undefined
      ? defaultBranchId.toString()
      : "all";

  const formatWeekDate = (d: Date) => {
    return d.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-FR", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* --- Branch Filter (Requirement 4) --- */}
      {safeBranches.length > 0 && (
        <div className="flex flex-col gap-1">
          <select
            id="branchFilter"
            onChange={(e) => handleFilterChange(e.target.value, "branchId")}
            value={currentBranchValue}
            className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48 bg-white font-medium text-gray-800"
          >
            <option value="all">{t("allBranches")}</option>
            {safeBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {t("branchPrefix", { name: b.name })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* --- Custom Searchable Dropdown for Teachers --- */}
      <div className="relative" ref={teacherDropdownRef}>
        <button
          type="button"
          onClick={() => setIsTeacherDropdownOpen((prev) => !prev)}
          className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48 flex items-center justify-between bg-white text-gray-800"
        >
          <span className="truncate">
            {selectedTeacher ? `${selectedTeacher.name} ${selectedTeacher.surname}` : t("filterByTeacher")}
          </span>
          <svg
            className={`w-4 h-4 transition-transform shrink-0 ${
              isTeacherDropdownOpen ? "transform rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            ></path>
          </svg>
        </button>
        {isTeacherDropdownOpen && (
          <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-30">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder={t("searchTeacherPlaceholder")}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <ul className="max-h-48 overflow-y-auto">
              <li
                onClick={() => {
                  handleFilterChange("all", "teacherId");
                  setIsTeacherDropdownOpen(false);
                }}
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm font-medium"
              >
                {t("allTeachers")}
              </li>
              {filteredTeachers.map((teacher) => (
                <li
                  key={teacher.id}
                  onClick={() => {
                    handleFilterChange(teacher.id, "teacherId");
                    setIsTeacherDropdownOpen(false);
                  }}
                  className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                >
                  {teacher.name} {teacher.surname}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>


      {/* --- Week Navigator Controls (Requirement 3) --- */}
      {currentWeekRange && (
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-full border border-gray-200 text-xs">
          <button
            type="button"
            title={t("weekNav.prev")}
            onClick={() => handleWeekChange(currentOffset - 1)}
            className="px-2.5 py-1 rounded-full text-gray-700 hover:bg-white hover:shadow-xs transition-all font-bold"
          >
            ←
          </button>

          <span className="px-2 text-gray-700 font-semibold whitespace-nowrap">
            {formatWeekDate(currentWeekRange.start)} - {formatWeekDate(currentWeekRange.end)}
          </span>

          <button
            type="button"
            title={t("weekNav.next")}
            onClick={() => handleWeekChange(currentOffset + 1)}
            className="px-2.5 py-1 rounded-full text-gray-700 hover:bg-white hover:shadow-xs transition-all font-bold"
          >
            →
          </button>

          {currentOffset !== 0 && (
            <button
              type="button"
              onClick={() => handleWeekChange(0)}
              className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-bold shadow-xs hover:bg-blue-700 transition-colors ms-1"
            >
              {t("weekNav.today")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TimetableFilters;
