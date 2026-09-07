"use client";

import { useState } from "react";
import { toast } from "react-toastify";
import { exportToExcel } from "@/lib/actions";
import Image from "next/image";

type ExportOptions = {
    classId?: number;
    workshopId?: number;
    dateFrom?: string;
    dateTo?: string;
    lessonId?: number;
};

type ExportButtonProps = {
    type: string;
    options?: ExportOptions;
    className?: string;
};

const ExportButton = ({ type, options, className }: ExportButtonProps) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleExport = async () => {
        setIsLoading(true);
        try {
            const result = await exportToExcel(type, options);

            if (result.success && result.file) {
                // Decode the base64 string into a byte array
                const byteCharacters = atob(result.file.content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                
                // Create a Blob from the byte array
                const blob = new Blob([byteArray], { type: result.file.type });

                // Create a temporary URL for the Blob
                const url = window.URL.createObjectURL(blob);

                // Create a temporary link element to trigger the download
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", result.file.name);
                document.body.appendChild(link);
                link.click();

                // Clean up by removing the link and revoking the URL
                link.parentNode?.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                toast.success("تم التصدير بنجاح!");
            } else {
                toast.error(result.message || "حدث خطأ أثناء التصدير.");
            }
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("فشل التصدير. تحقق من وحدة التحكم لمزيد من التفاصيل.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleExport}
            disabled={isLoading}
            className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:cursor-not-allowed ${className}`}
        >
            <Image src="/excel.png" alt="Export to Excel" width={16} height={16} />
            {isLoading ? "جارٍ التصدير..." : "تصدير إلى Excel"}
        </button>
    );
};

export default ExportButton;
