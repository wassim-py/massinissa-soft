import React from "react";
import dynamic from "next/dynamic";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations } from "next-intl/server";
import { serializeForClient } from "@/lib/utils";

const ConfigurationClient = dynamic(() => import("@/components/configuration/ConfigurationClient"), {
  loading: () => (
    <div className="p-8 text-center text-muted animate-pulse">
      <div className="h-8 w-64 bg-surface-muted rounded mb-6" />
      <div className="h-64 bg-surface-muted rounded-xl" />
    </div>
  ),
});

interface PageProps {
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function ConfigurationPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("configuration");
  const tCommon = await getTranslations("common");

  // Strict Owner-only protection (matching Finance and Teacher-profile pattern)
  if (!session.isOwner) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-12 border-border/80 shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {tCommon("unauthorizedAccess")}
          </Badge>
          <h2 className="text-section-title font-bold text-gray-900">
            {t("ownerOnlyTitle")}
          </h2>
          <p className="text-table-body text-muted text-sm">
            {t("ownerOnlyDesc")}
          </p>
        </div>
      </Card>
    );
  }

  // 1. Fetch Accounts
  const rawAccounts = await prisma.userProfile.findMany({
    include: {
      Branch: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    username: a.username,
    password: a.password,
    name: a.name,
    email: a.email,
    role: a.role as "OWNER" | "BRANCH_ADMIN" | "TEACHER",
    branchId: a.branchId,
    Branch: a.Branch,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  // 2. Fetch Branches with Classroom Counts
  const rawBranches = await prisma.branch.findMany({
    include: {
      _count: {
        select: { classrooms: true },
      },
    },
    orderBy: { id: "asc" },
  });

  const branches = rawBranches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    manager: b.manager,
    classroomsCount: b._count.classrooms,
  }));

  // 3. Fetch Classrooms with Branch & Lessons Count
  const rawClassrooms = await prisma.classroom.findMany({
    include: {
      branch: {
        select: { id: true, name: true },
      },
      _count: {
        select: { lessons: true },
      },
    },
    orderBy: [{ branchId: "asc" }, { name: "asc" }],
  });

  const classrooms = rawClassrooms.map((c) => ({
    id: c.id,
    name: c.name,
    branchId: c.branchId,
    branchName: c.branch?.name || `Branch #${c.branchId}`,
    lessonsCount: c._count.lessons,
  }));

  // 4. Fetch Trimesters & Academic Year for §7.20
  const allAcademicYears = await prisma.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: {
      trimesters: {
        orderBy: { startDate: "asc" },
        include: {
          _count: {
            select: {
              books: true,
              vouchers: {
                where: { paymentType: "BOOK", isVoided: false },
              },
            },
          },
        },
      },
      _count: {
        select: {
          enrollments: true,
        },
      },
    },
  });

  const academicYear = allAcademicYears[0] || null;

  const trimesters = (academicYear?.trimesters || []).map((t) => ({
    id: t.id,
    academicYearId: t.academicYearId,
    name: t.name,
    label: t.label,
    status: t.status as "not_started" | "active" | "finished",
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    booksCount: t._count.books,
    vouchersCount: t._count.vouchers,
  }));

  const academicYearInfo = academicYear
    ? {
        id: academicYear.id,
        label: academicYear.label,
        startDate: academicYear.startDate.toISOString(),
        endDate: academicYear.endDate.toISOString(),
      }
    : null;

  const academicYears = allAcademicYears.map((ay) => ({
    id: ay.id,
    label: ay.label,
    startDate: ay.startDate.toISOString(),
    endDate: ay.endDate.toISOString(),
    enrollmentsCount: ay._count.enrollments,
    trimestersCount: ay.trimesters.length,
    trimesters: ay.trimesters.map((t) => ({
      id: t.id,
      academicYearId: t.academicYearId,
      name: t.name,
      label: t.label,
      status: t.status as "not_started" | "active" | "finished",
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      booksCount: t._count.books,
      vouchersCount: t._count.vouchers,
    })),
  }));

  // 5. Fetch Academic Levels
  const rawLevels = await prisma.level.findMany({
    include: {
      _count: {
        select: {
          classes: true,
          books: true,
          voucherSeries: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const levels = rawLevels.map((l) => ({
    id: l.id,
    name: l.name,
    classesCount: l._count.classes,
    booksCount: l._count.books,
    voucherSeriesCount: l._count.voucherSeries,
  }));

  // 6. Fetch Formation Languages & Levels
  const rawFormationLanguages = await prisma.language.findMany({
    include: {
      FormationLevel: {
        include: {
          _count: {
            select: {
              Class: true,
              LevelTest: true,
            },
          },
        },
        orderBy: { levelNumber: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });

  const formationLanguages = rawFormationLanguages.map((lang) => ({
    id: lang.id,
    name: lang.name,
    levelsCount: lang.FormationLevel.length,
    classesCount: lang.FormationLevel.reduce((sum, lvl) => sum + lvl._count.Class, 0),
    levels: lang.FormationLevel.map((lvl) => ({
      id: lvl.id,
      languageId: lvl.languageId,
      levelNumber: lvl.levelNumber,
      name: lvl.name,
      lumpSumPrice: Number(lvl.lumpSumPrice),
      classesCount: lvl._count.Class,
      levelTestsCount: lvl._count.LevelTest,
    })),
  }));

  return (
    <ConfigurationClient
      accounts={serializeForClient(accounts)}
      branches={serializeForClient(branches)}
      classrooms={serializeForClient(classrooms)}
      trimesters={serializeForClient(trimesters)}
      academicYear={serializeForClient(academicYearInfo)}
      academicYears={serializeForClient(academicYears)}
      levels={serializeForClient(levels)}
      formationLanguages={serializeForClient(formationLanguages)}
      initialTab={searchParams.tab || "accounts"}
    />
  );
}
