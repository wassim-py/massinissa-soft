import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Class, Grade, Prisma, Student } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import PageHeader from "@/components/PageHeader"; // ADDED: Import the new header
import FormContainer from "@/components/FormContainer";
import ExportButton from "@/components/ExportButton";

type StudentList = Student & { classes: Class[] } & { grade: Grade };

const StudentListPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) => {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  const columns = [
    { header: "المعلومات", accessor: "info" },
    { header: "اسم المستخدم", accessor: "studentId", className: "hidden md:table-cell" },
    { header: "المستوى", accessor: "grade", className: "hidden md:table-cell" },
    { header: "الأقسام", accessor: "classes", className: "hidden md:table-cell" },
    { header: "رقم الهاتف", accessor: "phone", className: "hidden lg:table-cell" },
    { header: "العنوان", accessor: "address", className: "hidden lg:table-cell" },
    { header: "الإجراءات", accessor: "action" },
  ];

  const renderRow = (item: StudentList) => (
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
          <h3 className="font-semibold">{item.name} {item.surname}</h3>
          <p className="text-xs text-gray-500">
            {item.email || "No Email"}
          </p>
        </div>
      </td>
      <td className="hidden md:table-cell">{item.username}</td>
      <td className="hidden md:table-cell">{item.grade.level}</td>
      <td className="hidden md:table-cell">
        {item.classes.map((c) => c.name).join(", ")}
      </td>
      <td className="hidden md:table-cell">{item.phone}</td>
      <td className="hidden md:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
          <Link href={`/list/students/${item.id}`}>
            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
              <Image src="/view.png" alt="" width={16} height={16} />
            </button>
          </Link>
          {role === "admin" && (
            <FormContainer table="student" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;
  const query: Prisma.StudentWhereInput = {};

  // --- Role-based filtering logic ---
  if (role === 'teacher') {
    query.classes = {
        some: {
            teachers: {
                some: {
                    id: userId!
                }
            }
        }
    }
  }

  // --- Search logic ---
  if (search) {
    query.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { surname: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [data, count] = await prisma.$transaction([
    prisma.student.findMany({
      where: query,
      include: {
        classes: true,
        grade: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: {
        name: 'asc'
      }
    }),
    prisma.student.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* REPLACED: The old header is now the new, reusable PageHeader component */}
      <PageHeader 
        title="كل التلاميذ"
        searchPlaceholder="البحث بالاسم، اسم المستخدم..."
        // Only show the "Create" button to admins
        createAction={role === "admin" ? { table: "student", type: "create" } : null}
      />

      {role === 'admin' && (
      <ExportButton
      type="students"/>
      )}
      
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={data} />
      {/* PAGINATION */}
      <Pagination count={count} />
    </div>
  );
};

export default StudentListPage;
