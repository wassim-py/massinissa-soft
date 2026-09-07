import BackButton from "@/components/BackButton";
import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

const SingleCoursePage = async ({
  params: { id },
}: {
  params: { id: string };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  const course = await prisma.course.findUnique({
    where: {
      id: parseInt(id),
    },
    include: {
      subject: true,
      teacher: true,
      files: true, // Fetch all related files
    },
  });

  if (!course) {
    return notFound();
  }

  return (
    <div className="bg-white p-6 rounded-md flex-1 m-4 mt-0">
      <BackButton/>
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{course.title}</h1>
          <p className="text-md text-gray-500 mt-2">
            المادة:{" "}
            <span className="font-semibold text-gray-700">
              {course.subject.name}
            </span>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            من تقديم:{" "}
            <span className="font-medium text-gray-600">
              {course.teacher.name} {course.teacher.surname}
            </span>
          </p>
        </div>
        <div className="mt-4 md:mt-0">
          <p className="text-sm text-gray-400">
            تم الإنشاء بتاريخ:{" "}
            {new Intl.DateTimeFormat("ar-DZ", {
              dateStyle: "long",
            }).format(course.createdAt)}
          </p>
        </div>
      </div>

      {/* DESCRIPTION */}
      {course.description && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            الوصف
          </h2>
          <p className="text-gray-600 leading-relaxed">{course.description}</p>
        </div>
      )}

      {/* ATTACHED FILES */}
      <div>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">
          ملفات الدرس
        </h2>
        <div className="bg-gray-50 rounded-lg p-4">
          {course.files.length > 0 ? (
            <ul className="space-y-3">
              {course.files.map((file) => (
                <li
                  key={file.id}
                  className="p-3 bg-white rounded-md shadow-sm border border-gray-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src="/file-icon.png" // A generic file icon
                      alt="file"
                      width={24}
                      height={24}
                    />
                    <span className="text-gray-800 font-medium">
                      {file.name}
                    </span>
                  </div>
                  <a
                    href={file.url}
                    download
                    target="_blank" // Opens the file in a new tab for download
                    rel="noopener noreferrer"
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md text-sm transition-colors"
                  >
                    تحميل
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-500 py-4">
              لم يتم إرفاق أي ملفات لهذا الدرس بعد.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SingleCoursePage;
