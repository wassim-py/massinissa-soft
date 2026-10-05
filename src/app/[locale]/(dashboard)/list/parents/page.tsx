import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getAuthRole } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { splitFullName } from "@/lib/utils";

type ParentList = {
  id: string;
  name: string;
  surname: string;
  username: string;
  email: string;
  phone: string;
  address: string;
  img?: string | null;
  payerStudentId?: string | null;
  discountPercentage?: number;
  students: { id: string; name: string; surname: string }[];
};

const ParentListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const role = await getAuthRole();
  const t = await getTranslations("parents");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  if (role !== "admin") {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {tCommon("unauthorizedAccess")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorized")}
          </p>
        </div>
      </Card>
    );
  }

  const columns: Column<ParentList>[] = [
    {
      header: t("info"),
      accessor: "info",
    },
    {
      header: t("students"),
      accessor: "students",
      className: "hidden md:table-cell",
    },
    {
      header: t("phone"),
      accessor: "phone",
      className: "hidden lg:table-cell",
    },
    {
      header: t("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: ParentList) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="flex items-center gap-3.5 p-3.5">
        <Image
          src={item.img || "/parent.png"}
          alt=""
          width={40}
          height={40}
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover border border-border shrink-0 p-1 bg-surface-subtle"
        />
        <div className="flex flex-col min-w-0">
          <h4 className="text-table-body font-semibold text-gray-900 truncate">
            {item.name}
          </h4>
        </div>
      </td>
      <td className="hidden md:table-cell text-muted-dark">
        {item.students.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.students.map((student) => {
              const isPayer = student.id === item.payerStudentId;
              const displayName =
                (student as any).fullName ||
                (student.surname ? `${student.surname} ${student.name}` : student.name);
              return (
                <Link key={student.id} href={`/list/students/${student.id}`}>
                  <Badge
                    variant={isPayer ? "primary" : "secondary"}
                    size="sm"
                    className={`cursor-pointer hover:opacity-80 transition-opacity ${isPayer ? "font-bold" : ""}`}
                  >
                    {displayName}
                    {isPayer && (
                      <span className="ms-1 text-[10px] opacity-80">
                        ({locale === "ar" ? "الدافع" : "Payeur"})
                      </span>
                    )}
                  </Badge>
                </Link>
              );
            })}
            {item.discountPercentage != null && (
              <Badge variant="warning" size="sm" className="font-mono text-[10px]">
                {locale === "ar" ? `خصم ${item.discountPercentage}%` : `-${item.discountPercentage}%`}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted text-xs">-</span>
        )}
      </td>
      <td className="hidden md:table-cell text-muted-dark">{item.phone}</td>
      <td className="text-end pe-3.5">
        <div className="flex items-center justify-end gap-2">
          <FormContainer table="parent" type="update" data={item} />
          <FormContainer table="parent" type="delete" id={item.id} />
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  let data: ParentList[] = [];
  let count = 0;

  try {
    const whereClause = search
      ? {
          students: {
            some: {
              name: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
          },
        }
      : undefined;

    const [families, totalCount] = await prisma.$transaction([
      prisma.family.findMany({
        where: whereClause,
        include: {
          students: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { id: "asc" },
        take: ITEM_PER_PAGE,
        skip: ITEM_PER_PAGE * (p - 1),
      }),
      prisma.family.count({
        where: whereClause,
      }),
    ]);

    count = totalCount;
    data = families.map((f) => {
      const familyName = f.name || t("familyNumber", { number: f.id });
      const primaryPhone = f.students.find((s) => s.phone)?.phone || "-";
      return {
        id: String(f.id),
        name: familyName,
        surname: "",
        username: `family_${f.id}`,
        email: "-",
        phone: primaryPhone,
        address: "-",
        payerStudentId: f.payerStudentId,
        discountPercentage: Number(f.discountPercentage ?? 50),
        students: f.students.map((s) => {
          const { surname, name: firstName } = splitFullName(s.name);
          return { id: s.id, name: firstName, surname, fullName: s.name };
        }),
      };
    });
  } catch {
    data = [];
    count = 0;
  }

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <PageHeader
          title={t("title")}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={{ table: "parent", type: "create" }}
        />

        <DataTable
          columns={columns}
          renderRow={renderRow}
          data={data}
          emptyTitle={t("noParents")}
          emptyDescription={t("noParentsDesc")}
          pagination={<Pagination count={count} />}
        />
      </CardContent>
    </Card>
  );
};

export default ParentListPage;
