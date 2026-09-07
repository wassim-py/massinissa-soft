"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

const BackButton = () => {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
    >
      <Image src="/back-arrow.png" alt="رجوع" width={16} height={16} />
      رجوع
    </button>
  );
};

export default BackButton;