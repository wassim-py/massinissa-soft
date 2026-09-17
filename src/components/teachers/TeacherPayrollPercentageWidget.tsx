"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { updateTeacherPayrollPercentageAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { Percent, Edit2, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function TeacherPayrollPercentageWidget({
  teacherId,
  initialPercentage,
}: {
  teacherId: string;
  initialPercentage: number;
}) {
  const t = useTranslations("teacherProfile");
  const [percentage, setPercentage] = useState<number>(initialPercentage);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<number>(initialPercentage);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValue < 0 || editValue > 100 || isNaN(editValue)) {
      toast.error(t("invalidPercentageError"));
      return;
    }

    startTransition(async () => {
      const res = await updateTeacherPayrollPercentageAction({
        teacherId,
        percentage: editValue,
      });

      if (res.success) {
        toast.success(res.message);
        setPercentage(editValue);
        setIsEditing(false);
      } else {
        toast.error(res.message || t("rateUpdated"));
      }
    });
  };

  return (
    <div className="bg-surface-subtle/80 border border-border/80 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center border border-border text-muted-dark shrink-0">
          <Percent className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <span className="text-xs text-muted font-medium block truncate">
            {t("percentageLabel")}
          </span>
          {isEditing ? (
            <form onSubmit={handleSave} className="flex items-center gap-2 mt-1.5">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="ring-1 ring-border/80 border-0 px-2 py-1 rounded-md text-xs w-20 font-bold bg-surface text-gray-900 focus:ring-2 focus:ring-primary/20"
                value={editValue}
                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                autoFocus
              />
              <span className="text-xs text-muted font-medium">{t("percentOfFee")}</span>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                className="py-1 px-2.5 text-xs"
                disabled={isPending}
                leftIcon={<Check className="w-3 h-3" />}
              >
                {isPending ? "..." : t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditValue(percentage);
                }}
                className="py-1 px-2 text-xs"
              >
                <X className="w-3 h-3" />
              </Button>
            </form>
          ) : (
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-bold text-success-text">
                {percentage}%
              </span>
              <span className="text-xs text-muted">{t("perPresentStudent")}</span>
            </div>
          )}
        </div>
      </div>

      {!isEditing && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="text-xs shrink-0"
          leftIcon={<Edit2 className="w-3 h-3" />}
        >
          {t("edit")}
        </Button>
      )}
    </div>
  );
}
