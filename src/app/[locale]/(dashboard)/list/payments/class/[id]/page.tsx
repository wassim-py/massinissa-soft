import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import PaymentGrid from "@/components/PaymentGrid";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import GroupTabs from "@/components/groups/GroupTabs";
import { serializeForClient } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations } from "next-intl/server";
import { getActiveTrimester } from "@/lib/configurationActions";

const ClassPaymentHistoryPage = async (
  props: { 
    params: Promise<{ id: string }>,
    searchParams: Promise<{ [key: string]: string | undefined }> 
  }
) => {
  const params = await props.params;
  const t = await getTranslations("payments");
  const session = await getAuthSession();

  if (!session.isOwnerOrAdmin && !session.isBranchAdmin) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
        </div>
      </Card>
    );
  }

  const classId = parseInt(params.id, 10);
  if (isNaN(classId)) {
    notFound();
  }

  // Fetch full class details with all relations required for the grid
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      branch: true,
      teacher: {
        include: {
          TeacherPayRate: {
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      },
      enrollments: {
        include: {
          student: {
            include: {
              registeredBranch: true,
              family: true,
              enrollments: {
                include: {
                  class: {
                    include: {
                      branch: true,
                    },
                  },
                },
              },
            },
          },
          transfersFrom: true,
          transfersTo: true,
        },
        orderBy: { enrolledAt: "asc" },
      },
      vouchers: {
        include: {
          series: true,
          edits: {
            orderBy: { editedAt: "desc" },
          },
          refunds: {
            orderBy: { refundedAt: "desc" },
          },
        },
        orderBy: { issuedAt: "asc" },
      },
      lessons: {
        where: { isFree: false },
        include: {
          attendances: {
            where: { status: "PRESENT" },
          },
        },
      },
    },
  });

  if (!classData) {
    notFound();
  }

  // Branch isolation: a branch admin cannot access payments of a class in another branch
  if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, classData.branchId)) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedBranchDesc")}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  // Deduplicate enrollments by studentId if duplicates exist in database
  const enrollmentMap = new Map<string, typeof classData.enrollments[0]>();
  for (const enr of classData.enrollments) {
    if (!enrollmentMap.has(enr.studentId)) {
      enrollmentMap.set(enr.studentId, enr);
    } else {
      const existing = enrollmentMap.get(enr.studentId)!;
      enrollmentMap.set(enr.studentId, {
        ...enr,
        transfersFrom: [...existing.transfersFrom, ...enr.transfersFrom],
        transfersTo: [...existing.transfersTo, ...enr.transfersTo],
        feeOverriddenByOwner: existing.feeOverriddenByOwner || enr.feeOverriddenByOwner,
        inscriptionFeeCharged: existing.inscriptionFeeCharged || enr.inscriptionFeeCharged,
      });
    }
  }
  classData.enrollments = Array.from(enrollmentMap.values());

  // Fetch classes across all branches for group credit transfers
  const [availableClasses, activeTrimester] = await Promise.all([
    prisma.class.findMany({
      select: {
        id: true,
        name: true,
        branch: { select: { name: true } },
      },
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
    }),
    getActiveTrimester(),
  ]);

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 mb-4 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-page-title text-gray-900">
                {t("gridTitle", { name: classData.name })}
              </h1>
              <Badge variant="primary" size="md">
                {t("branchBadge", { name: classData.branch.name })}
              </Badge>
            </div>
            <p className="text-form-helper text-muted mt-1">
              {t("gridSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ExportButton
              type="payments"
              options={{ classId: classData.id }}
            />
            <BackButton />
          </div>
        </div>

        {/* Group Navigation Tabs (§7.20) */}
        <GroupTabs
          classId={classData.id}
          activeTab="payments"
          hasBooks={classData.hasBooks}
        />

        {/* Excel-Style Interactive Payment Grid */}
        <PaymentGrid
          classData={serializeForClient(classData) as any}
          availableClassesForTransfer={serializeForClient(availableClasses) as any}
          activeTrimester={serializeForClient(activeTrimester) as any}
        />
      </CardContent>
    </Card>
  );
};

export default ClassPaymentHistoryPage;