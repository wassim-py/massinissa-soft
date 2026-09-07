import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Class, Grade, Prisma, Teacher } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import PageHeader from "@/components/PageHeader"; // ADDED: Import the new header

type ClassList = Class & { supervisor: Teacher | null } & { grade: Grade };

const ClassListPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  if (role !== "admin") {
    return (
      <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  const columns = [
    { header: "اسم القسم", accessor: "name" },
    { header: "الطاقة الاستيعابية", accessor: "capacity", className: "hidden md:table-cell" },
    { header: "المستوى الدراسي", accessor: "grade", className: "hidden md:table-cell" },
    { header: "المشرف", accessor: "supervisor", className: "hidden md:table-cell" },
    { header: "إجراءات", accessor: "action" },
  ];

  const renderRow = (item: ClassList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-gray-100"
    >
      <td className="p-4 font-medium">{item.name}</td>
      <td className="hidden md:table-cell p-4">{item.capacity}</td>
      <td className="hidden md:table-cell p-4">{item.grade.level}</td>
      <td className="hidden md:table-cell p-4">
        {item.supervisor
          ? `${item.supervisor.name} ${item.supervisor.surname}`
          : "لا يوجد مشرف"}
      </td>
      <td>
        <div className="flex items-center gap-2 p-4">
          {role === "admin" && (
            <>
              <FormContainer table="class" type="update" data={item} />
              <FormContainer table="class" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  // MODIFIED: Standardized search query logic
  const query: Prisma.ClassWhereInput = {};
  if (search) {
    query.name = { contains: search, mode: "insensitive" };
  }

  const [data, count] = await prisma.$transaction([
    prisma.class.findMany({
      where: query,
      include: {
        supervisor: true,
        grade: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { name: 'asc' }
    }),
    prisma.class.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* REPLACED: The old header is now the new, reusable PageHeader component */}
      <PageHeader
        title="جميع الأقسام"
        searchPlaceholder="ابحث باسم القسم..."
        createAction={role === "admin" ? { table: "class", type: "create" } : null}
      />

      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={data}/>
      {/* PAGINATION */}
      <Pagination count={count} />
    </div>
  );
};

export default ClassListPage;
