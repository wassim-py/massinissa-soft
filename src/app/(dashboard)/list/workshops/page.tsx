import FormContainer from "@/components/FormContainer";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

const WorkshopListPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  const where: Prisma.WorkshopWhereInput = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { teacherName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [workshops, count] = await prisma.$transaction([
    prisma.workshop.findMany({
      where,
      include: {
        _count: {
          select: { sessions: true, participants: true },
        },
        sessions: {
          orderBy: { startTime: "asc" },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.workshop.count({ where }),
  ]);

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="الدورات"
        searchPlaceholder="البحث بعنوان الدورة أو اسم الأستاذ..."
        createAction={
          role === "admin" ? { table: "workshop", type: "create" } : null
        }
      />

      {workshops.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {workshops.map((workshop) => (
              <div
                key={workshop.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col"
              >
                <Link
                  href={`/list/workshops/${workshop.id}`}
                  className="block p-6 flex-grow hover:bg-gray-50 transition-colors rounded-t-lg"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-purple-100 p-3 rounded-full">
                      <Image
                        src="/lesson.png"
                        alt="workshop icon"
                        width={24}
                        height={24}
                      />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">
                      {workshop.title}
                    </h2>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 h-10 overflow-hidden">
                    {workshop.description}
                  </p>
                  <div className="text-sm space-y-2 text-gray-600 border-t pt-4">
                    <p>
                      <strong>السعر:</strong> DZD{workshop.price.toFixed()}
                    </p>
                    <p>
                      <strong>الحصص:</strong> {workshop._count.sessions}
                    </p>
                    <p>
                      <strong>الاستاذ:</strong> {workshop.teacherName}
                    </p>
                    {role === "admin" && (
                      <p>
                        <strong>مسجلين:</strong>{" "}
                        {workshop._count.participants}
                      </p>
                    )}
                  </div>
                </Link>
                {role === "admin" && (
                  <div className="border-t p-3 bg-gray-50 flex items-center justify-end gap-2">
                    <FormContainer
                      table="workshop"
                      type="update"
                      data={workshop}
                    />
                    <FormContainer
                      table="workshop"
                      type="delete"
                      id={workshop.id}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination count={count} />
        </>
      ) : (
        <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg mt-8">
            <Image src="/workshop.png" alt="No workshops" width={64} height={64} className="mx-auto opacity-50" />
            <h2 className="text-xl font-semibold text-gray-700 mt-4">
                لم يتم العثور على دورات
            </h2>
            <p className="text-gray-500 mt-2">
                {search
                ? `بحثك عن "${search}" لم يطابق أي دورة.`
                : "لم يتم إنشاء أي دورات بعد."}
            </p>
        </div>
      )}
    </div>
  );
};

export default WorkshopListPage;
