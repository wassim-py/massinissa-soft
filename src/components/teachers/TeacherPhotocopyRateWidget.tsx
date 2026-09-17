"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { updateTeacherPhotocopyRateAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { Printer, Edit2, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function TeacherPhotocopyRateWidget({
  teacherId,
  initialRate,
}: {
  teacherId: string;
  initialRate: number;
}) {
  const t = useTranslations("teacherProfile");
  const [rate, setRate] = useState<number>(initialRate);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<number>(initialRate);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValue < 0 || isNaN(editValue)) {
      toast.error(t("invalidPriceError"));
      return;
    }

    startTransition(async () => {
      const res = await updateTeacherPhotocopyRateAction({
        teacherId,
        ratePerPage: editValue,
      });

      if (res.success) {
        toast.success(res.message);
        setRate(editValue);
        setIsEditing(false);
      } else {
        toast.error(res.message || t("priceUpdated"));
      }
    });
  };

  return (
    <div className="bg-surface-subtle/80 border border-border/80 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center border border-border text-muted-dark shrink-0">
          <Printer className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <span className="text-xs text-muted font-medium block truncate">
            {t("photocopyRateTitle")}
          </span>
          {isEditing ? (
            <form onSubmit={handleSave} className="flex items-center gap-2 mt-1.5">
              <input
                type="number"
                min="0"
                step="0.5"
                className="ring-1 ring-border/80 border-0 px-2 py-1 rounded-md text-xs w-20 font-bold bg-surface text-gray-900 focus:ring-2 focus:ring-primary/20"
                value={editValue}
                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                autoFocus
              />
              <span className="text-xs text-muted font-medium">{t("perPage")}</span>
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
                  setEditValue(rate);
                }}
                className="py-1 px-2 text-xs"
              >
                <X className="w-3 h-3" />
              </Button>
            </form>
          ) : (
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-bold text-gray-900">
                {rate}
              </span>
              <span className="text-xs text-muted">{t("perPage")}</span>
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
