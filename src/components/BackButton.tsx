"use client";

import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";

const BackButton = () => {
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
    >
      <Image
        src="/back-arrow.png"
        alt={t("back")}
        width={16}
        height={16}
        className="ltr:rotate-180 transition-transform"
      />
      <span>{t("back")}</span>
    </button>
  );
};

export default BackButton;