import Image from "next/image";
import CountChart from "./CountChart";
import prisma from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";

const CountChartContainer = async () => {
  let boys = 0;
  let girls = 0;

  try {
    const res = await prisma.$queryRaw<
      Array<{ count: string | number | bigint }>
    >`SELECT count(*) FROM "Student"`;
    boys = Number(res[0]?.count || 0);
    girls = 0;
  } catch {
    boys = 0;
    girls = 0;
  }

  const totalStudents = boys + girls;
  const t = await getTranslations("dashboard.countChart");

  return (
    <Card className="w-full h-full p-6 flex flex-col justify-between">
      {/* TITLE */}
      <div className="flex justify-between items-center">
        <h1 className="text-section-title font-bold text-gray-900">{t("title")}</h1>
        <Link href="/list/students">
          <Image src="/moreDark.png" alt="" width={20} height={20} />
        </Link>
      </div>

      {/* CHART */}
      <CountChart boys={boys} girls={girls} />

      {/* BOTTOM */}
      <div className="flex justify-center gap-16">
        <div className="flex flex-col gap-1 items-center">
          <div className="w-5 h-5 bg-wsmSky rounded-full" />
          <h1 className="font-bold text-gray-800">{boys}</h1>
          <h2 className="text-xs text-gray-500">
            {t("boys")} (
            {totalStudents > 0 ? Math.round((boys / totalStudents) * 100) : 0}
            %)
          </h2>
        </div>
        <div className="flex flex-col gap-1 items-center">
          <div className="w-5 h-5 bg-wsmYellow rounded-full" />
          <h1 className="font-bold text-gray-800">{girls}</h1>
          <h2 className="text-xs text-gray-500">
            {t("girls")} (
            {totalStudents > 0 ? Math.round((girls / totalStudents) * 100) : 0}
            %)
          </h2>
        </div>
      </div>
    </Card>
  );
};

export default CountChartContainer;
