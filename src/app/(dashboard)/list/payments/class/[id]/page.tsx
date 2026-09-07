import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import StudentPaymentDetails from "@/components/StudentPaymentDetails";
import TableSearch from "@/components/TableSearch";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";

const ClassPaymentHistoryPage = async ({ 
    params,
    searchParams 
}: { 
    params: { id: string },
    searchParams: { [key: string]: string | undefined } 
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  // Authorization check
  if (role !== 'admin') {
      return <div className="p-4">ليس لديك صلاحية للوصول إلى هذه الصفحة.</div>;
  }

  const classId = parseInt(params.id);
  const searchQuery = searchParams.search;

  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        where: {
            ...(searchQuery && {
                OR: [
                    { name: { contains: searchQuery, mode: 'insensitive' } },
                    { surname: { contains: searchQuery, mode: 'insensitive' } },
                ]
            })
        },
        orderBy: { name: 'asc' },
        include: {
          payments: {
            where: { classId: classId },
            orderBy: { date: 'desc' },
            // MODIFIED: Include the refunds for each payment
            include: {
              refunds: {
                select: {
                  amount: true
                }
              }
            }
          },
          attendances: {
            where: { lesson: { classId: classId } },
          }
        },
      },
    },
  });

  if (!classData) {
    notFound();
  }

  return (
    <div className="bg-white p-6 rounded-lg m-4 mt-0">
      <BackButton/>
      {/* Page Header with Search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-4 mb-6 gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">سجل الدفع لـ: {classData.name}</h1>
            <p className="text-gray-500 mt-1">
            سجل مفصل لجميع الدفعات التي قام بها الطلاب في هذا القسم.
            </p>
        </div>
        <div className="w-full md:w-auto">
            <TableSearch placeholder="ابحث عن تلميذ..." />
        </div>
        <ExportButton
        type="payments"
        options={{ classId: classData.id }}/>
      </div>

      {/* Student Payment List */}
      <div className="space-y-6">
        {classData.students.length > 0 ? (
            classData.students.map(student => (
                <StudentPaymentDetails
                    key={student.id}
                    student={student as any} // Cast as any to satisfy component prop type
                    classData={classData}
                />
            ))
        ) : (
            <p className="text-center text-gray-500 py-8">لم يتم العثور على تلاميذ يطابقون بحثك.</p>
        )}
      </div>
    </div>
  );
};

export default ClassPaymentHistoryPage;