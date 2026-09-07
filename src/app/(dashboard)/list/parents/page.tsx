import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Parent, Prisma, Student } from "@prisma/client";
import Image from "next/image";
import { auth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";



type ParentList = Parent & { students: Student[] };

const ParentListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  if (role !== "admin") {
    return (
      <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
        <p>ليست لديك الصلاحية للوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  const columns = [
    {
      header: "معلومات",
      accessor: "info",
    },
    {
      header: "أسماء التلاميذ",
      accessor: "students",
      className: "hidden md:table-cell",
    },
    {
      header: "رقم الهاتف",
      accessor: "phone",
      className: "hidden lg:table-cell",
    },
    {
      header: "العنوان",
      accessor: "address",
      className: "hidden lg:table-cell",
    },
    {
      header: "إجراءات",
      accessor: "action",
    },
  ];

  const renderRow = (item: ParentList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-gray-100"
    >
      <td className="flex items-center gap-4 p-4">
        <Image
          src={item.img || "/noAvatar.png"}
          alt=""
          width={40}
          height={40}
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <h3 className="font-semibold">
            {item.name} {item.surname}
          </h3>
          <p className="text-xs text-gray-500">{item?.email}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">
        {item.students.map((student) => `${student.name} ${student.surname}`).join(", ")}
      </td>
      <td className="hidden md:table-cell">{item.phone}</td>
      <td className="hidden md:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
            <FormContainer table="parent" type="update" data={item} />
            <FormContainer table="parent" type="delete" id={item.id} />
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  const query: Prisma.ParentWhereInput = {};
  if (search) {
    query.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { surname: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [data, count] = await prisma.$transaction([
    prisma.parent.findMany({
      where: query,
      include: {
        students: {
            // FIXED: The student 'id' is now included in the selection
            select: {
                id: true,
                name: true,
                surname: true,
            }
        },
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { name: 'asc' }
    }),
    prisma.parent.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <PageHeader
        title="كل الأولياء"
        searchPlaceholder="ابحث بالاسم أو المستخدم أو البريد..."
        createAction={{ table: "parent", type: "create" }}
      />

      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination count={count} />
    </div>
  );
};

export default ParentListPage;
