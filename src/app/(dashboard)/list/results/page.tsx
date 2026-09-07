import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Prisma, Student } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import ResultsFilters from "@/components/ResultsFilters";
import ChildSwitcher from "@/components/ChildSwitcher";
import BackButton from "@/components/BackButton";

// =================================================================
// STUDENT & PARENT VIEW: REPORT CARD COMPONENT
// =================================================================
const ReportCard = ({ results }: { results: any[] }) => {
  const groupedResults = results.reduce((acc, result) => {
    const subjectName = result.exam.subject.name;
    if (!acc[subjectName]) {
      acc[subjectName] = {
        results: [],
        totalScore: 0,
        count: 0,
      };
    }
    acc[subjectName].results.push(result);
    acc[subjectName].totalScore += result.score;
    acc[subjectName].count += 1;
    return acc;
  }, {} as any);

  Object.keys(groupedResults).forEach((subjectName) => {
    const subject = groupedResults[subjectName];
    const average = subject.totalScore / subject.count;
    subject.average = average.toFixed(2);
  });

  return (
    <div className="space-y-6">
      {Object.entries(groupedResults).map(([subjectName, subjectData]: [string, any]) => (
        <div key={subjectName} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h2 className="text-xl font-bold text-gray-800">{subjectName}</h2>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-700">{subjectData.average}</p>
              <p className="text-xs text-gray-500">المعدل</p>
            </div>
          </div>
          <ul className="space-y-3">
            {subjectData.results.map((result: any) => (
              <li key={result.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-700">{result.exam.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(result.exam.startTime).toLocaleDateString()}
                  </p>
                </div>
                {/* UPDATED: Ensure score is formatted to 2 decimal places */}
                <p className="font-bold text-lg text-blue-600">{result.score.toFixed(2)}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};


// =================================================================
// MAIN PAGE COMPONENT
// =================================================================
const ResultListPage = async ({
  searchParams,
}: {
  searchParams: { [key:string]: string | undefined };
}) => {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;

  // --- RENDER STUDENT/PARENT VIEW ---
  if (role === 'student' || role === 'parent') {
    let activeStudentId: string | undefined = undefined;
    let children: Student[] = [];

    if (role === 'student') {
        activeStudentId = currentUserId!;
    } else { // role is 'parent'
        children = await prisma.student.findMany({
            where: { parentId: currentUserId! },
            orderBy: { name: 'asc' },
        });
        activeStudentId = searchParams.studentId || children[0]?.id;
    }

    const results = activeStudentId ? await prisma.result.findMany({
      where: { studentId: activeStudentId },
      include: {
        exam: { include: { subject: true } },
      },
      orderBy: { exam: { startTime: 'desc' } }
    }) : [];

    return (
        <div className="p-4 md:p-6">
            {role === 'parent' && children.length > 0 && (
                <div className="mb-6">
                    <ChildSwitcher students={children} activeStudentId={activeStudentId} />
                </div>
            )}
            <div className="mb-6">
                <h1 className="text-3xl font-bold">كشف النقاط</h1>
                <p className="text-gray-500">ملخص للأداء الدراسي.</p>
            </div>
            {results.length > 0 ? (
                <ReportCard results={results} /> 
            ) : (
                <p className="text-center text-gray-500 py-8">لم يتم العثور على نتائج لهذا التلميذ.</p>
            )}
        </div>
    )
  }

  // --- RENDER ADMIN/TEACHER VIEW (Existing Table) ---
  const query: Prisma.ResultWhereInput = {};
  const examWhere: Prisma.ExamWhereInput = {};

  if (searchParams.search) {
    query.OR = [
      { exam: { title: { contains: searchParams.search, mode: "insensitive" } } },
      { student: { name: { contains: searchParams.search, mode: "insensitive" } } },
      { student: { surname: { contains: searchParams.search, mode: "insensitive" } } },
      { exam: { subject: { name: { contains: searchParams.search, mode: "insensitive" } } } },
    ];
  }

  if (searchParams.classId) {
    examWhere.classId = parseInt(searchParams.classId);
  }
  if (searchParams.subjectId) {
    examWhere.subjectId = parseInt(searchParams.subjectId);
  }
  
  if (searchParams.studentId) {
    query.studentId = searchParams.studentId;
  }

  if (role === "teacher") {
    examWhere.teacherId = currentUserId!;
  }

  if (Object.keys(examWhere).length > 0) {
    query.exam = examWhere;
  }

  const page = searchParams.page ? parseInt(searchParams.page) : 1;

  const [results, count, classes, students, subjects] = await Promise.all([
    prisma.result.findMany({
      where: query,
      include: {
        student: { select: { name: true, surname: true } },
        exam: {
          include: {
            subject: { select: { name: true } },
            class: { select: { name: true } },
            teacher: { select: { name: true, surname: true } },
          },
        },
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (page - 1),
      orderBy: { exam: { startTime: 'desc' } }
    }),
    prisma.result.count({ where: query }),
    prisma.class.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.student.findMany({ select: { id: true, name: true, surname: true }, orderBy: { name: 'asc' } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  ]);

  const displayData = results.map((item) => ({
    id: item.id,
    examTitle: item.exam.title,
    studentName: item.student.name,
    studentSurname: item.student.surname,
    subjectName: item.exam.subject.name,
    teacherName: item.exam.teacher.name,
    teacherSurname: item.exam.teacher.surname,
    score: item.score,
    className: item.exam.class.name,
    examDate: item.exam.startTime,
  }));
  
  const columns = [
    { header: "اسم الامتحان", accessor: "examTitle" },
    { header: "الطالب", accessor: "student" },
    { header: "العلامة", accessor: "score" },
    { header: "المادة", accessor: "subject", className: "hidden md:table-cell" },
    { header: "الأستاذ", accessor: "teacher", className: "hidden md:table-cell" },
    { header: "القسم", accessor: "class", className: "hidden md:table-cell" },
    { header: "التاريخ", accessor: "date", className: "hidden md:table-cell" },
  ];

  const renderRow = (item: any) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-gray-100">
      <td className="p-4">{item.examTitle}</td>
      {/* FIXED: Correctly display student's full name */}
      <td className="p-4">{`${item.studentName} ${item.studentSurname}`}</td>
      {/* UPDATED: Ensure score is formatted to 2 decimal places */}
      <td className="p-4 font-semibold">{item.score.toFixed(2)}</td>
      <td className="p-4 hidden md:table-cell">{item.subjectName}</td>
      <td className="p-4 hidden md:table-cell">{`${item.teacherName} ${item.teacherSurname}`}</td>
      <td className="p-4 hidden md:table-cell">{item.className}</td>
      <td className="p-4 hidden md:table-cell">{new Intl.DateTimeFormat("ar-DZ").format(item.examDate)}</td>
    </tr>
  );

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <BackButton />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-3xl font-bold text-gray-800 mt-3">كل النتائج</h2>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch placeholder="ابحث عن نتائج..." />
          <ResultsFilters 
            classes={classes}
            students={students}
            subjects={subjects}
          />
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={displayData} />
      <Pagination count={count} />
    </div>
  );
};

export default ResultListPage;
