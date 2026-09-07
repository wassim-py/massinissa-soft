import Image from "next/image";
import CountChart from "./CountChart";
import prisma from "@/lib/prisma";
import Link from "next/link";

const CountChartContainer = async () => {
  let boys = 0;
  let girls = 0;

  try {
    // Fetch the student counts grouped by sex
    const data = await prisma.student.groupBy({
      by: ["sex"],
      _count: true,
    });

    // Safely assign the counts
    boys = data.find((d) => d.sex === "MALE")?._count || 0;
    girls = data.find((d) => d.sex === "FEMALE")?._count || 0;
  } catch (error) {
    // If the database query fails for any reason during the build,
    // log the error and default to 0. This prevents the build from crashing.
    console.error("Failed to fetch student counts for chart:", error);
    boys = 0;
    girls = 0;
  }

  const totalStudents = boys + girls;

  return (
    <div className="bg-white rounded-xl w-full h-full p-4">
      {/* TITLE */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">التلاميذ</h1>
        <Link href="list/students"><Image src="/moreDark.png" alt="" width={20} height={20} /></Link>
      </div>
      {/* CHART */}
      <CountChart boys={boys} girls={girls} />
      {/* BOTTOM */}
      <div className="flex justify-center gap-16">
        <div className="flex flex-col gap-1">
          <div className="w-5 h-5 bg-lamaSky rounded-full" />
          <h1 className="font-bold">{boys}</h1>
          <h2 className="text-xs text-gray-300">
            {/* FIX: Prevent division by zero if there are no students */}
            أولاد ({totalStudents > 0 ? Math.round((boys / totalStudents) * 100) : 0}
            %)
          </h2>
        </div>
        <div className="flex flex-col gap-1">
          <div className="w-5 h-5 bg-lamaYellow rounded-full" />
          <h1 className="font-bold">{girls}</h1>
          <h2 className="text-xs text-gray-300">
            {/* FIX: Prevent division by zero if there are no students */}
            بنات ({totalStudents > 0 ? Math.round((girls / totalStudents) * 100) : 0}
            %)
          </h2>
        </div>
      </div>
    </div>
  );
};

export default CountChartContainer;
