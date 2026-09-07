import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import EnterResultsForm from "@/components/forms/EnterResultsForm"; // Import the Client Component
import BackButton from "@/components/BackButton";



// This is a Server Component. It has no "use client" directive.
// It is responsible for fetching data and handling authorization.
const EnterResultsPage = async (props: { params: Promise<{ id: string }> }) => {
  const params = await props.params;
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  // Authorization check on the server
  if (role !== 'admin' && role !== 'teacher') {
      return <div className="p-4">ليست لديك الصلاحية للوصول إلى هذه الصفحة.</div>;
  }

  const examId = parseInt(params.id);

  // Data fetching with Prisma on the server
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      class: {
        include: {
          students: {
            orderBy: {
              name: 'asc' // Order students alphabetically
            }
          },
        },
      },
      subject: true,
      results: {
        select: {
            studentId: true,
            score: true,
        }
      }
    },
  });

  // Handle case where exam is not found
  if (!exam) {
    notFound();
  }

  return (
    <div className="bg-white p-6 rounded-lg m-4 mt-0">
      <BackButton/>
      {/* Page Header */}
      <div className="border-b pb-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">{exam.title}</h1>
        <div className="flex items-center gap-6 text-sm text-gray-500 mt-2">
          <span>
            <strong>القسم:</strong> {exam.class.name}
          </span>
          <span>
            <strong>المادة:</strong> {exam.subject.name}
          </span>
          <span>
            <strong>التاريخ:</strong>{" "}
            {new Date(exam.startTime).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Render the Client Component and pass the fetched data down as props */}
      <EnterResultsForm
        exam={exam}
        students={exam.class.students}
        existingResults={exam.results}
      />
    </div>
  );
};

export default EnterResultsPage;
