"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Banknote } from "lucide-react";
import RevisionVisitorModal, { type RevisionClassOption } from "./RevisionVisitorModal";

interface QuickRevisionButtonProps {
  classId?: number;
  className?: string;
  availableClasses?: RevisionClassOption[];
  compact?: boolean;
}

export default function QuickRevisionButton({
  classId,
  className,
  availableClasses,
  compact = false,
}: QuickRevisionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === "ar";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs cursor-pointer active:scale-95 shrink-0 ${
          compact ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-xs"
        }`}
      >
        <Banknote className="w-4 h-4 shrink-0" />
        <span>
          {classId
            ? isAr
              ? "+ دفع حصة مراجعة"
              : "+ Paiement révision"
            : isAr
            ? "+ تسجيل مراجعة (حصة أو أكثر)"
            : "+ Paiement révision"}
        </span>
      </button>

      <RevisionVisitorModal
        classId={classId}
        className={className}
        availableClasses={availableClasses}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}
