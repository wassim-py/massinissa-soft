"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import FinalLevelEnrollmentModal from "./FinalLevelEnrollmentModal";
import { useTranslations } from "next-intl";
import { GraduationCap, ArrowRight } from "lucide-react";

interface FinalLevelEnrollmentButtonProps {
  graduatedStudents: Array<{ id: string; name: string; phone?: string | null }>;
  availableFormations: Array<{
    id: number;
    name: string;
    levelName?: string;
    languageName?: string;
    price?: number;
  }>;
  role?: string;
}

export default function FinalLevelEnrollmentButton({
  graduatedStudents,
  availableFormations,
  role = "admin",
}: FinalLevelEnrollmentButtonProps) {
  const t = useTranslations("formations");
  const [isOpen, setIsOpen] = useState(false);

  const isAdminOrOwner = role === "admin" || role === "owner";
  if (!isAdminOrOwner || graduatedStudents.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(true)}
        leftIcon={<GraduationCap className="w-4 h-4 text-emerald-600" />}
        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
        className="font-bold border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
      >
        {t("enrollInNewFormation")}
      </Button>

      <FinalLevelEnrollmentModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        graduatedStudents={graduatedStudents}
        availableFormations={availableFormations}
      />
    </>
  );
}
