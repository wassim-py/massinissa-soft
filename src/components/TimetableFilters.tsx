"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

type LevelForFilter = {
  id: number;
  name: string;
};

type SubjectForFilter = {
  id: number;
  name: string;
};

type BranchForFilter = {
  id: number;
  name: string;
};

type TeacherForFilter = {
  id: string;
  name: string;
  surname?: string;
};

type ClassForFilter = {
  id: number;
  name: string;
};

const TimetableFilters = ({
  levels = [],
  subjects = [],
  branches = [],
  defaultBranchId,
  currentWeekRange,
  teachers = [],
  classes = [],
}: {
  levels?: LevelForFilter[];
  subjects?: SubjectForFilter[];
  branches?: BranchForFilter[];
  defaultBranchId?: number;
  currentWeekRange?: {
    start: Date;
    end: Date;
    offset: number;
  };
  teachers?: TeacherForFilter[];
  classes?: ClassForFilter[];
}) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const t = useTranslations("lessons");
  const locale = useLocale();

  const safeLevels = Array.isArray(levels) ? levels : [];
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const safeBranches = Array.isArray(branches) ? branches : [];

  // --- START: State for the custom level dropdown ---
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const [levelSearchTerm, setLevelSearchTerm] = useState("");
  const levelDropdownRef = useRef<HTMLDivElement>(null);
  // --- END: State for the custom level dropdown ---

  // --- START: State for the custom subject dropdown ---
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [subjectSearchTerm, setSubjectSearchTerm] = useState("");
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  // --- END: State for the custom subject dropdown ---

  const handleFilterChange = (
    value: string,
    filterName: string
  ) => {
    const params = new URLSearchParams(searchParams);
    // Remove obsolete filter params if present
    params.delete("teacherId");
    params.delete("classId");

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

  // Effect to close the custom dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        levelDropdownRef.current &&
        !levelDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLevelDropdownOpen(false);
      }
      if (
        subjectDropdownRef.current &&
        !subjectDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSubjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter levels based on the search term
  const filteredLevels = safeLevels.filter((lvl) =>
    lvl.name.toLowerCase().includes(levelSearchTerm.toLowerCase())
  );
  const selectedLevelId = searchParams.get("levelId");
  const selectedLevel = safeLevels.find((l) => l.id.toString() === selectedLevelId);

  // Filter subjects based on the search term
  const filteredSubjects = safeSubjects.filter((sub) =>
    sub.name.toLowerCase().includes(subjectSearchTerm.toLowerCase())
  );
  const selectedSubjectId = searchParams.get("subjectId");
  const selectedSubject = safeSubjects.find((s) => s.id.toString() === selectedSubjectId);

  const selectedBranchParam = searchParams.get("branchId");
  const currentBranchValue =
    selectedBranchParam !== null
      ? selectedBranchParam
      : defaultBranchId !== undefined
      ? defaultBranchId.toString()
      : "all";

  const formatWeekDate = (d: Date) => {
    return new Date(d).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-FR", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Algiers",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* --- Branch Filter --- */}
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

      {/* --- Custom Searchable Dropdown for Levels --- */}
      {safeLevels.length > 0 && (
        <div className="relative" ref={levelDropdownRef}>
          <button
            type="button"
            onClick={() => setIsLevelDropdownOpen((prev) => !prev)}
            className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48 flex items-center justify-between bg-white text-gray-800"
          >
            <span className="truncate">
              {selectedLevel ? selectedLevel.name : t("filterByLevel")}
            </span>
            <svg
              className={`w-4 h-4 transition-transform shrink-0 ${
                isLevelDropdownOpen ? "transform rotate-180" : ""
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
          {isLevelDropdownOpen && (
            <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-30">
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  placeholder={t("searchLevelPlaceholder")}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                  value={levelSearchTerm}
                  onChange={(e) => setLevelSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>
              <ul className="max-h-48 overflow-y-auto">
                <li
                  onClick={() => {
                    handleFilterChange("all", "levelId");
                    setIsLevelDropdownOpen(false);
                    setLevelSearchTerm("");
                  }}
                  className={`p-2 hover:bg-gray-100 cursor-pointer text-sm font-medium ${
                    !selectedLevelId ? "bg-blue-50 text-blue-700" : ""
                  }`}
                >
                  {t("allLevels")}
                </li>
                {filteredLevels.map((lvl) => (
                  <li
                    key={lvl.id}
                    onClick={() => {
                      handleFilterChange(lvl.id.toString(), "levelId");
                      setIsLevelDropdownOpen(false);
                      setLevelSearchTerm("");
                    }}
                    className={`p-2 hover:bg-gray-100 cursor-pointer text-sm ${
                      selectedLevelId === lvl.id.toString()
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : ""
                    }`}
                  >
                    {lvl.name}
                  </li>
                ))}
                {filteredLevels.length === 0 && (
                  <li className="p-2 text-center text-xs text-gray-400">
                    {t("noLevelsFound")}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* --- Custom Searchable Dropdown for Subjects --- */}
      {safeSubjects.length > 0 && (
        <div className="relative" ref={subjectDropdownRef}>
          <button
            type="button"
            onClick={() => setIsSubjectDropdownOpen((prev) => !prev)}
            className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48 flex items-center justify-between bg-white text-gray-800"
          >
            <span className="truncate">
              {selectedSubject ? selectedSubject.name : t("filterBySubject")}
            </span>
            <svg
              className={`w-4 h-4 transition-transform shrink-0 ${
                isSubjectDropdownOpen ? "transform rotate-180" : ""
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
          {isSubjectDropdownOpen && (
            <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-30">
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  placeholder={t("searchSubjectPlaceholder")}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                  value={subjectSearchTerm}
                  onChange={(e) => setSubjectSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>
              <ul className="max-h-48 overflow-y-auto">
                <li
                  onClick={() => {
                    handleFilterChange("all", "subjectId");
                    setIsSubjectDropdownOpen(false);
                    setSubjectSearchTerm("");
                  }}
                  className={`p-2 hover:bg-gray-100 cursor-pointer text-sm font-medium ${
                    !selectedSubjectId ? "bg-blue-50 text-blue-700" : ""
                  }`}
                >
                  {t("allSubjects")}
                </li>
                {filteredSubjects.map((sub) => (
                  <li
                    key={sub.id}
                    onClick={() => {
                      handleFilterChange(sub.id.toString(), "subjectId");
                      setIsSubjectDropdownOpen(false);
                      setSubjectSearchTerm("");
                    }}
                    className={`p-2 hover:bg-gray-100 cursor-pointer text-sm ${
                      selectedSubjectId === sub.id.toString()
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : ""
                    }`}
                  >
                    {sub.name}
                  </li>
                ))}
                {filteredSubjects.length === 0 && (
                  <li className="p-2 text-center text-xs text-gray-400">
                    {t("noSubjectsFound")}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* --- Week Navigator Controls --- */}
      {currentWeekRange && (
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-full border border-gray-200 text-xs">
          <button
            type="button"
            title={t("weekNav.prev")}
            aria-label={t("weekNav.prev")}
            onClick={() => handleWeekChange(currentOffset - 1)}
            className="p-1.5 rounded-full text-gray-700 hover:bg-white hover:shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            {locale === "ar" ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="px-2 text-gray-700 font-semibold whitespace-nowrap">
            {formatWeekDate(currentWeekRange.start)} - {formatWeekDate(currentWeekRange.end)}
          </span>

          <button
            type="button"
            title={t("weekNav.next")}
            aria-label={t("weekNav.next")}
            onClick={() => handleWeekChange(currentOffset + 1)}
            className="p-1.5 rounded-full text-gray-700 hover:bg-white hover:shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            {locale === "ar" ? (
              <ChevronLeft className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {currentOffset !== 0 && (
            <button
              type="button"
              onClick={() => handleWeekChange(0)}
              className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-bold shadow-xs hover:bg-blue-700 transition-colors ms-1 cursor-pointer"
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
