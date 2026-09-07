import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Prisma, Subject, Teacher } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import PageHeader from "@/components/PageHeader"; // ADDED: Import the new header

type SubjectList = Subject & { teachers: Teacher[] };

const SubjectListPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  const columns = [
    {
      header: "اسم المادة",
      accessor: "name",
    },
    {
      header: "اساتذة المادة",
      accessor: "teachers",
      className: "hidden md:table-cell",
    },
    {
      header: "",
      accessor: "action",
    },
  ];

  const renderRow = (item: SubjectList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-gray-100"
    >
      <td className="p-4 font-medium">{item.name}</td>
      <td className="hidden md:table-cell p-4">
        {item.teachers.map((teacher) => `${teacher.name} ${teacher.surname}`).join(", ")}
      </td>
      <td>
        <div className="flex items-center gap-2 p-4">
          {role === "admin" && (
            <>
              <FormContainer table="subject" type="update" data={item} />
              <FormContainer table="subject" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  // MODIFIED: Standardized search query logic
  const query: Prisma.SubjectWhereInput = {};
  if (search) {
    query.name = { contains: search, mode: "insensitive" };
  }

  const [data, count] = await prisma.$transaction([
    prisma.subject.findMany({
      where: query,
      include: {
        teachers: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { name: 'asc' }
    }),
    prisma.subject.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* REPLACED: The old header is now the new, reusable PageHeader component */}
      <PageHeader
        title="جميع المواد"
        searchPlaceholder="ابحث باسم المادة..."
        createAction={role === "admin" ? { table: "subject", type: "create" } : null}
      />

      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={data} />
      {/* PAGINATION */}
      <Pagination count={count} />
    </div>
  );
};

export default SubjectListPage;