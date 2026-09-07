"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const ResultsFilters = ({ classes, students, subjects }: { classes: any[], students: any[], subjects: any[] }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

  // --- State for Searchable Student Dropdown ---
  const [studentSearch, setStudentSearch] = useState("");
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const studentFilterRef = useRef<HTMLDivElement>(null);

  // Get the currently selected student's name for display
  const selectedStudentId = searchParams.get("studentId");
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const displayStudentName = selectedStudent ? `${selectedStudent.name} ${selectedStudent.surname}` : "تصفية حسب التلميذ";

  // Filter students based on the search input
  const filteredStudents = students.filter(student =>
    `${student.name} ${student.surname}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // --- Event Handlers ---
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");

    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    replace(`${pathname}?${params.toString()}`);
  };

  const handleStudentSelect = (studentId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    params.set("studentId", studentId);
    replace(`${pathname}?${params.toString()}`);
    setIsStudentDropdownOpen(false);
  };

  const handleResetFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("classId");
    params.delete("studentId");
    params.delete("subjectId");
    params.delete("search");
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (studentFilterRef.current && !studentFilterRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        name="classId"
        className="p-2 border rounded-md text-sm bg-white"
        onChange={handleSelectChange}
        value={searchParams.get("classId") || ""}
      >
        <option value="">تصفية حسب القسم</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      
      {/* --- Searchable Student Dropdown --- */}
      <div className="relative" ref={studentFilterRef}>
        <button
          type="button"
          className="p-2 border rounded-md text-sm bg-white w-48 text-left"
          onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
        >
          {displayStudentName}
        </button>
        {isStudentDropdownOpen && (
          <div className="absolute z-10 top-full mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
            <input
              type="text"
              placeholder="ابحث عن تلميذ..."
              className="w-full p-2 border-b"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            <ul>
              {filteredStudents.map((s) => (
                <li
                  key={s.id}
                  className="p-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleStudentSelect(s.id)}
                >
                  {s.name} {s.surname}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <select
        name="subjectId"
        className="p-2 border rounded-md text-sm bg-white"
        onChange={handleSelectChange}
        value={searchParams.get("subjectId") || ""}
      >
        <option value="">تصفية حسب المادة</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* --- Reset Button --- */}
      <button
        type="button"
        onClick={handleResetFilters}
        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-gray-300 hover:text-gray-800 transition-colors"
      >
        اعادة تعيين
      </button>
    </div>
  );
};

export default ResultsFilters;
