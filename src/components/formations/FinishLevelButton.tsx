"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { finishFormationLevel, reopenFormationLevel } from "@/lib/formationActions";
import CloseLevelProgressionModal from "./CloseLevelProgressionModal";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";

interface FinishLevelButtonProps {
  classId: number;
  isCompleted?: boolean;
  completedAt?: Date | string | null;
  role?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function FinishLevelButton({
  classId,
  isCompleted = false,
  completedAt,
  role = "admin",
  size = "md",
  className = "",
}: FinishLevelButtonProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);

  const isAdminOrOwner = role === "admin" || role === "owner";
  if (!isAdminOrOwner) {
    return isCompleted ? (
      <Badge variant="success" size="sm" withDot>
        {t("levelCompletedBadge")}
      </Badge>
    ) : (
      <Badge variant="neutral" size="sm" withDot>
        {t("levelActiveBadge")}
      </Badge>
    );
  }

  const handleExecuteReopen = async () => {
    setIsLoading(true);
    try {
      const res = await reopenFormationLevel(classId);

      if (res.success) {
        toast.success(res.message);
        setShowReopenModal(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || (locale === "ar" ? "حدث خطأ غير متوقع" : "Une erreur est survenue"));
    } finally {
      setIsLoading(false);
    }
  };

  const formattedDate = completedAt
    ? new Date(completedAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <>
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        {isCompleted ? (
          <div className="flex items-center gap-2">
            <Badge variant="success" size="md" withDot className="font-semibold">
              {t("levelCompletedBadge")}
              {formattedDate && ` (${formattedDate})`}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReopenModal(true)}
              disabled={isLoading}
              title={t("reopenLevel")}
              className="text-muted hover:text-gray-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            size={size}
            onClick={() => setShowCloseModal(true)}
            isLoading={isLoading}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
            className="font-semibold shadow-sm"
          >
            {t("finishLevel")}
          </Button>
        )}
      </div>

      {/* Close Level Progression Modal with Cascading Prompts */}
      <CloseLevelProgressionModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        classId={classId}
        onSuccess={() => router.refresh()}
      />

      {/* Reopen Confirmation Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-blue-100 text-blue-600">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {t("reopenLevel")}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {t("reopenLevelConfirm")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowReopenModal(false)}
                  disabled={isLoading}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleExecuteReopen}
                  isLoading={isLoading}
                >
                  {tCommon("confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
