import React from "react";
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import BackButton from "@/components/BackButton";
import GroupTabs from "@/components/groups/GroupTabs";
import GroupBooksTab from "@/components/groups/GroupBooksTab";
import { getGroupBooksData } from "@/lib/bookActions";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { serializeForClient } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ClassGroupDetailPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const locale = await getLocale();
  const t = await getTranslations("classes");

  const classId = parseInt(params.id, 10);
  if (isNaN(classId)) {
    notFound();
  }

  // If user requested tab payments or attendance, redirect to their dedicated routes
  if (searchParams.tab === "payments") {
    redirect(`/${locale}/list/payments/class/${classId}`);
  }
  if (searchParams.tab === "attendance") {
    redirect(`/${locale}/list/attendance/class/${classId}`);
  }

  const groupData = await getGroupBooksData(classId);
  if (!groupData) {
    notFound();
  }

  // Branch Access Control
  if (
    !session.isOwner &&
    !canUserAccessBranch(session.rawRole, session.branchIds, groupData.classData.branchId)
  ) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs font-sans">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
          </Badge>
          <p className="text-table-body text-gray-800 font-medium">
            {locale === "ar"
              ? "لا يمكنك الاطلاع على تفاصيل فوج تابع لفرع آخر."
              : "Vous ne pouvez pas consulter un groupe appartenant à un autre siège."}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  const { classData, activeTrimester, allTrimesters, books, feePaidStudents, allLevels } =
    groupData;

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 mb-4 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-page-title text-gray-900 font-bold">
                {classData.name}
              </h1>
              <Badge variant="primary" size="md">
                {classData.branchName}
              </Badge>
              {classData.levelName && (
                <Badge variant="neutral" size="md">
                  {classData.levelName}
                </Badge>
              )}
            </div>
            <p className="text-form-helper text-muted mt-1">
              {locale === "ar"
                ? `الأستاذ: ${classData.teacherName || "غير محدد"} • عدد التلاميذ المسجلين: ${classData.enrollmentsCount}`
                : `Enseignant : ${classData.teacherName || "Non assigné"} • Élèves inscrits : ${classData.enrollmentsCount}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <BackButton />
          </div>
        </div>

        {/* Group Navigation Tabs */}
        <GroupTabs
          classId={classData.id}
          activeTab="books"
          hasBooks={classData.hasBooks}
        />

        {/* Group Books Tab Component */}
        <GroupBooksTab
          classData={serializeForClient(classData)}
          activeTrimester={serializeForClient(activeTrimester)}
          allTrimesters={serializeForClient(allTrimesters)}
          books={serializeForClient(books)}
          allStudents={serializeForClient(groupData.allStudents)}
          feePaidStudents={serializeForClient(feePaidStudents)}
          allLevels={serializeForClient(allLevels)}
        />
      </CardContent>
    </Card>
  );
}
