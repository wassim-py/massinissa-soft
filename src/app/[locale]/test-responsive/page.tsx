"use client";

import { useSearchParams } from "next/navigation";
import PaymentGrid, { ExtendedClass } from "@/components/PaymentGrid";
import AttendanceRoster from "@/components/forms/AttendanceRoster";
import AttendanceGrid from "@/components/AttendanceGrid";
import Timetable from "@/components/Timetable";
import Link from "next/link";
import { Suspense } from "react";

const mockClassData: any = {
  id: 1,
  name: "فوج الرياضيات - 4 متوسط (أ)",
  capacity: 25,
  price: 3500 as any,
  branchId: 1,
  gradeId: 1,
  supervisorId: "teacher-1",
  hasBooks: true,
  bookFee: 1500 as any,
  isFormation: false,
  language: null,
  formationLevel: null,
  academicYearId: 1,
  branch: { id: 1, name: "المقر الرئيسي (Amphi)" },
  enrollments: [
    {
      id: 1,
      studentId: "s-1",
      classId: 1,
      enrolledAt: new Date("2026-09-01"),
      academicYearId: 1,
      student: {
        id: "s-1",
        name: "ياسين بلقاسم",
        phone: "0550123456",
        registeredBranchId: 1,
        familyId: 1,
        createdAt: new Date(),
        registeredBranch: { id: 1, name: "المقر الرئيسي (Amphi)" },
        family: { id: 1, payerStudentId: "s-1" },
        enrollments: [
          { id: 1, classId: 1, class: { id: 1, name: "4 متوسط", branchId: 1, branch: { name: "Amphi" } } },
          { id: 2, classId: 2, class: { id: 2, name: "لغة عربية", branchId: 2, branch: { name: "Ecole" } } },
        ],
      },
      transfersFrom: [],
      transfersTo: [],
    },
    {
      id: 2,
      studentId: "s-2",
      classId: 1,
      enrolledAt: new Date("2026-09-01"),
      academicYearId: 1,
      student: {
        id: "s-2",
        name: "أمينة منصوري",
        phone: "0661987654",
        registeredBranchId: 2,
        familyId: 2,
        createdAt: new Date(),
        registeredBranch: { id: 2, name: "فرع المدرسة (Ecole)" },
        family: { id: 2, payerStudentId: "s-2" },
        enrollments: [
          { id: 3, classId: 1, class: { id: 1, name: "4 متوسط", branchId: 1, branch: { name: "Amphi" } } },
        ],
      },
      transfersFrom: [],
      transfersTo: [],
    },
    {
      id: 3,
      studentId: "s-3",
      classId: 1,
      enrolledAt: new Date("2026-09-01"),
      academicYearId: 1,
      student: {
        id: "s-3",
        name: "كريم بلقاسم (أخ)",
        phone: "0550123457",
        registeredBranchId: 1,
        familyId: 1,
        createdAt: new Date(),
        registeredBranch: { id: 1, name: "المقر الرئيسي (Amphi)" },
        family: { id: 1, payerStudentId: "s-1" }, // s-1 is payer
        enrollments: [
          { id: 4, classId: 1, class: { id: 1, name: "4 متوسط", branchId: 1, branch: { name: "Amphi" } } },
        ],
      },
      transfersFrom: [],
      transfersTo: [],
    },
    {
      id: 4,
      studentId: "s-4",
      classId: 1,
      enrolledAt: new Date("2026-09-01"),
      academicYearId: 1,
      student: {
        id: "s-4",
        name: "سارة حداد",
        phone: "0770554433",
        registeredBranchId: 1,
        familyId: null,
        createdAt: new Date(),
        registeredBranch: { id: 1, name: "المقر الرئيسي (Amphi)" },
        family: null,
        enrollments: [
          { id: 5, classId: 1, class: { id: 1, name: "4 متوسط", branchId: 1, branch: { name: "Amphi" } } },
        ],
      },
      transfersFrom: [],
      transfersTo: [],
    },
  ],
  vouchers: [
    {
      id: 1,
      number: 1001,
      seriesId: 1,
      issuingBranchId: 1,
      targetBranchId: 1,
      paymentType: "TUITION_4SESSION" as any,
      amount: 3500 as any,
      remainingBalance: 3500 as any,
      isPartial: false,
      studentId: "s-1",
      classId: 1,
      inscriptionFeeCharged: true,
      inscriptionFeeWaived: false,
      bookFeeIncluded: true,
      issuedBy: "Admin Amphi",
      issuedAt: new Date("2026-09-02"),
      isVoided: false,
      notes: null,
      parentVoucherId: null,
      academicYearId: 1,
    },
    {
      id: 2,
      number: 1002,
      seriesId: 1,
      issuingBranchId: 1,
      targetBranchId: 1,
      paymentType: "INSCRIPTION_FEE" as any,
      amount: 1000 as any,
      remainingBalance: 1000 as any,
      isPartial: false,
      studentId: "s-1",
      classId: 1,
      inscriptionFeeCharged: true,
      inscriptionFeeWaived: false,
      bookFeeIncluded: false,
      issuedBy: "Admin Amphi",
      issuedAt: new Date("2026-09-02"),
      isVoided: false,
      notes: null,
      parentVoucherId: null,
      academicYearId: 1,
    },
    {
      id: 3,
      number: 1003,
      seriesId: 1,
      issuingBranchId: 1,
      targetBranchId: 1,
      paymentType: "BOOK_FEE" as any,
      amount: 1500 as any,
      remainingBalance: 1500 as any,
      isPartial: false,
      studentId: "s-1",
      classId: 1,
      inscriptionFeeCharged: false,
      inscriptionFeeWaived: false,
      bookFeeIncluded: true,
      issuedBy: "Admin Amphi",
      issuedAt: new Date("2026-09-02"),
      isVoided: false,
      notes: null,
      parentVoucherId: null,
      academicYearId: 1,
    },
    {
      id: 4,
      number: 1004,
      seriesId: 1,
      issuingBranchId: 1,
      targetBranchId: 1,
      paymentType: "TUITION_4SESSION" as any,
      amount: 3500 as any,
      remainingBalance: 3500 as any,
      isPartial: false,
      studentId: "s-2",
      classId: 1,
      inscriptionFeeCharged: false,
      inscriptionFeeWaived: false,
      bookFeeIncluded: false,
      issuedBy: "Admin Amphi",
      issuedAt: new Date("2026-09-03"),
      isVoided: false,
      notes: null,
      parentVoucherId: null,
      academicYearId: 1,
    },
  ],
  lessons: [
    {
      id: 1,
      isFree: false,
      attendances: [
        { studentId: "s-1", status: "PRESENT" },
        { studentId: "s-2", status: "PRESENT" },
        { studentId: "s-2", status: "PRESENT" },
        { studentId: "s-2", status: "PRESENT" }, // 3 consumed -> 1 left = EXPIRING
      ],
    },
  ],
};

const mockLesson = {
  id: 101,
  name: "حصة الرياضيات الأسبوعية",
  day: "MONDAY" as any,
  startsAt: new Date("2026-09-08T08:00:00"),
  endsAt: new Date("2026-09-08T10:00:00"),
  subjectId: 1,
  classId: 1,
  teacherId: "teacher-1",
  classroomId: 1,
  branchId: 1,
  isExtra: false,
  extraFee: null,
  isCatchUp: false,
  isFree: false,
  class: mockClassData,
  teacher: {
    id: "teacher-1",
    name: "أ. محمد بوزيد",
    phone: "0550000000",
    email: null,
    address: "Batna",
    bloodType: "O+",
    birthday: new Date(),
    sex: "MALE" as any,
    createdAt: new Date(),
    ratePerSession: 1500 as any,
    monthlySalary: null,
    branchRates: [],
  },
};

const mockStudentsForRoster: any[] = mockClassData.enrollments.map((e: any) => ({
  ...e.student,
  vouchers: mockClassData.vouchers.filter((v: any) => v.studentId === e.studentId),
  attendances: [{ id: 1, date: new Date(), studentId: e.studentId, lessonId: 101, status: "PRESENT" }],
}));

const mockLessonInstances = [
  { key: "1-2026-09-01", date: "2026-09-01", lessonName: "الحصة 1", lessonId: 101 },
  { key: "1-2026-09-03", date: "2026-09-03", lessonName: "الحصة 2", lessonId: 101 },
  { key: "1-2026-09-06", date: "2026-09-06", lessonName: "الحصة 3", lessonId: 101 },
  { key: "1-2026-09-08", date: "2026-09-08", lessonName: "الحصة 4", lessonId: 101 },
];

const mockAttendanceMap = new Map<string, Map<string, boolean>>([
  ["s-1", new Map([["1-2026-09-01", true], ["1-2026-09-03", true], ["1-2026-09-06", false], ["1-2026-09-08", true]])],
  ["s-2", new Map([["1-2026-09-01", true], ["1-2026-09-03", true], ["1-2026-09-06", true], ["1-2026-09-08", true]])],
  ["s-3", new Map([["1-2026-09-01", false], ["1-2026-09-03", true], ["1-2026-09-06", true], ["1-2026-09-08", true]])],
  ["s-4", new Map([["1-2026-09-01", false], ["1-2026-09-03", false], ["1-2026-09-06", false], ["1-2026-09-08", false]])],
]);

const mockTimetableLessons: any[] = [
  {
    id: 1,
    day: "SATURDAY",
    startsAt: new Date("2026-09-05T08:00:00"),
    endsAt: new Date("2026-09-05T10:00:00"),
    classId: 1,
    teacherId: "teacher-1",
    classroomId: 1,
    branchId: 1,
    isExtra: false,
    extraFee: null,
    isCatchUp: false,
    isFree: false,
    class: { id: 1, name: "4 متوسط (أ)" },
    teacher: { id: "teacher-1", name: "أ. محمد بوزيد" },
    classroom: { id: 1, name: "قاعة 01" },
    subject: { name: "رياضيات" },
  },
  {
    id: 2,
    day: "SATURDAY",
    startsAt: new Date("2026-09-05T10:00:00"),
    endsAt: new Date("2026-09-05T12:00:00"),
    classId: 2,
    teacherId: "teacher-2",
    classroomId: 2,
    branchId: 1,
    isExtra: true,
    extraFee: null,
    isCatchUp: false,
    isFree: false,
    class: { id: 2, name: "3 متوسط (ب)" },
    teacher: { id: "teacher-2", name: "أ. فاطمة حداد" },
    classroom: { id: 2, name: "قاعة 02" },
    subject: { name: "فيزياء" },
  },
  {
    id: 3,
    day: "SUNDAY",
    startsAt: new Date("2026-09-06T14:00:00"),
    endsAt: new Date("2026-09-06T16:00:00"),
    classId: 3,
    teacherId: "teacher-3",
    classroomId: 3,
    branchId: 1,
    isExtra: false,
    extraFee: null,
    isCatchUp: true,
    isFree: false,
    class: { id: 3, name: "1 ثانوي (علوم)" },
    teacher: { id: "teacher-3", name: "أ. علي مسعودي" },
    classroom: { id: 3, name: "مدرج رئيسي" },
    subject: { name: "علوم طبيعية" },
  },
  {
    id: 4,
    day: "TUESDAY",
    startsAt: new Date("2026-09-08T09:00:00"),
    endsAt: new Date("2026-09-08T11:00:00"),
    classId: 1,
    teacherId: "teacher-1",
    classroomId: 1,
    branchId: 1,
    isExtra: false,
    extraFee: null,
    isCatchUp: false,
    isFree: true,
    class: { id: 1, name: "4 متوسط (أ)" },
    teacher: { id: "teacher-1", name: "أ. محمد بوزيد" },
    classroom: { id: 1, name: "قاعة 01" },
    subject: { name: "رياضيات (حصة مجانية)" },
  },
];

function TestResponsiveContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "payment";

  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-6" dir="rtl">
      {/* Test Navigation Bar */}
      <div className="bg-white p-3 rounded-xl shadow-xs border mb-4 flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-sm sm:text-base font-bold text-gray-900">
          معاينة الشاشات الكثيفة على الهاتف (Responsive Preview)
        </h1>
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <Link
            href="/ar/test-responsive?view=payment"
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              view === "payment" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            جدول الدفع (Payment Grid)
          </Link>
          <Link
            href="/ar/test-responsive?view=roster"
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              view === "roster" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            تسجيل الحضور (Attendance Roster)
          </Link>
          <Link
            href="/ar/test-responsive?view=attendance-grid"
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              view === "attendance-grid" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            شبكة الحضور (Attendance Grid)
          </Link>
          <Link
            href="/ar/test-responsive?view=timetable"
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              view === "timetable" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            جدول التوقيت (Timetable)
          </Link>
        </div>
      </div>

      {/* Screen Render */}
      <div>
        {view === "payment" && (
          <PaymentGrid classData={mockClassData} availableClassesForTransfer={[]} />
        )}
        {view === "roster" && (
          <AttendanceRoster
            lesson={mockLesson as any}
            students={mockStudentsForRoster}
            existingRecords={[]}
          />
        )}
        {view === "attendance-grid" && (
          <AttendanceGrid
            students={mockStudentsForRoster}
            lessonInstances={mockLessonInstances}
            attendanceMap={mockAttendanceMap}
          />
        )}
        {view === "timetable" && (
          <Timetable
            lessons={mockTimetableLessons}
            actions={{}}
            relatedDataForForms={{}}
            userRole="admin"
          />
        )}
      </div>
    </div>
  );
}

export default function TestResponsivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TestResponsiveContent />
    </Suspense>
  );
}
