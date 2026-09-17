"use client";

import { useState } from "react";
import { toast } from "react-toastify";
import { exportToExcel } from "@/lib/actions";
import Image from "next/image";
import { useTranslations } from "next-intl";

type ExportOptions = {
  classId?: number;
  workshopId?: number;
  dateFrom?: string;
  dateTo?: string;
  lessonId?: number;
  branchId?: number | string;
  periodMode?: "daily" | "weekly" | "monthly";
};

type ExportButtonProps = {
  type: string;
  options?: ExportOptions;
  className?: string;
};

const ExportButton = ({ type, options, className }: ExportButtonProps) => {
  const t = useTranslations("export");
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const result = await exportToExcel(type, options);

      if (result.success && result.file) {
        // Decode base64 string into byte array
        const byteCharacters = atob(result.file.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        // Create a Blob from byte array
        const blob = new Blob([byteArray], { type: result.file.type });

        // Create a temporary link element to trigger download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", result.file.name);
        document.body.appendChild(link);
        link.click();

        // Clean up
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success(t("success"));
      } else {
        toast.error(result.message || t("error"));
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(t("error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isLoading}
      className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:cursor-not-allowed ${className || ""}`}
    >
      <Image src="/excel.png" alt="Excel icon" width={16} height={16} />
      {isLoading ? t("loading") : t("button")}
    </button>
  );
};

export default ExportButton;
