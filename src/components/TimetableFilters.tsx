"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";

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

const TimetableFilters = ({
  teachers,
  classes,
}: {
  teachers: TeacherForFilter[];
  classes: ClassForFilter[];
}) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

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
    if (value && value !== "all") {
      params.set(filterName, value);
    } else {
      params.delete(filterName);
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
  const filteredTeachers = teachers.filter((teacher) =>
    `${teacher.name} ${teacher.surname}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );
  
  const selectedTeacherId = searchParams.get("teacherId");
  const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);

  return (
    <div className="flex items-center gap-4">
      {/* --- START: Custom Searchable Dropdown for Teachers --- */}
      <div className="relative" ref={teacherDropdownRef}>
        <button
          type="button"
          onClick={() => setIsTeacherDropdownOpen((prev) => !prev)}
          className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48 flex items-center justify-between"
        >
          <span className={selectedTeacher ? "text-black" : "text-black"}>
            {selectedTeacher ? `${selectedTeacher.name} ${selectedTeacher.surname}` : "تصفية حسب الأستاذ"}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${
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
          // FIX: Increased z-index to 20 to ensure it appears above the timetable header
          <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-20">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search teachers..."
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
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                جميع الأساتذة
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
      {/* --- END: Custom Searchable Dropdown for Teachers --- */}


      {/* Filter by Class */}
      <div className="flex flex-col gap-1">
        <select
          id="classFilter"
          onChange={(e) => handleFilterChange(e.target.value, "classId")}
          defaultValue={searchParams.get("classId") || ""}
          className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-full text-sm w-48"
        >
          <option value="" disabled>
            تصفية حسب القسم
          </option>
          <option value="all">جميع الأقسام</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default TimetableFilters;
