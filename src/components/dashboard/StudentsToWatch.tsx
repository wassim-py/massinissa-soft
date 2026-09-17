"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import PaymentForm from "@/components/forms/PaymentForm";
import {
  AlertTriangle,
  CreditCard,
  Search,
  CheckCircle2,
  Calendar,
  AlertCircle,
  X,
} from "lucide-react";

export interface StudentToWatchItem {
  studentId: string;
  studentName: string;
  phone?: string | null;
  classId: number;
  className: string;
  teacherName: string;
  lessonTime: string;
  remainingSessions: number;
  status: "EXPIRING" | "UNPAID" | "PAID";
  studentData: any;
  classData: any;
}

interface StudentsToWatchProps {
  students: StudentToWatchItem[];
}

export default function StudentsToWatch({ students }: StudentsToWatchProps) {
  const [filterMode, setFilterMode] = useState<"expiring_only" | "all">(
    "expiring_only"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    item: StudentToWatchItem | null;
  }>({ isOpen: false, item: null });

  const t = useTranslations("dashboard.studentsToWatch");

  const criticalStudents = students.filter((s) => s.remainingSessions <= 1);
  const targetStudents =
    filterMode === "expiring_only" ? criticalStudents : students;

  const filtered = targetStudents.filter(
    (s) =>
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>{t("title")}</span>
              {criticalStudents.length > 0 && (
                <Badge variant="warning" size="sm" withDot>
                  {criticalStudents.length}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted mt-0.5">{t("subtitle")}</p>
          </div>

          {/* Filter modes */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-surface-subtle p-0.5 rounded-lg border border-border/80 text-xs">
              <button
                onClick={() => setFilterMode("expiring_only")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  filterMode === "expiring_only"
                    ? "bg-surface text-amber-700 shadow-xs font-semibold"
                    : "text-muted hover:text-gray-900"
                }`}
              >
                {t("filterExpiring", { count: criticalStudents.length })}
              </button>
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  filterMode === "all"
                    ? "bg-surface text-primary shadow-xs font-semibold"
                    : "text-muted hover:text-gray-900"
                }`}
              >
                {t("filterAll", { count: students.length })}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-3">
          {/* Search bar if there are multiple students */}
          {targetStudents.length > 3 && (
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder={t("studentName")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface-subtle/50 focus:bg-surface focus:outline-hidden focus:border-primary transition-all"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/80" />
              <p className="text-sm font-medium text-gray-700">
                {t("noStudents")}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((item) => {
                const isLastSession = item.remainingSessions === 1;
                const isUnpaid = item.remainingSessions <= 0;

                return (
                  <div
                    key={`${item.studentId}-${item.classId}`}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isUnpaid
                        ? "bg-rose-50/40 border-rose-200"
                        : isLastSession
                        ? "bg-amber-50/40 border-amber-200"
                        : "bg-surface border-border hover:border-border/80"
                    }`}
                  >
                    {/* Left: Student & Group Info */}
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">
                          {item.studentName}
                        </span>
                        {item.phone && (
                          <span className="text-xs text-muted font-mono">
                            ({item.phone})
                          </span>
                        )}

                        {/* Remaining badge */}
                        {isUnpaid ? (
                          <Badge variant="danger" size="sm" withDot>
                            <AlertCircle className="w-3 h-3 mr-1 inline" />
                            {t("unpaidSession")} ({item.remainingSessions})
                          </Badge>
                        ) : isLastSession ? (
                          <Badge variant="warning" size="sm" withDot>
                            <AlertTriangle className="w-3 h-3 mr-1 inline" />
                            {t("lastPaidSession")}
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            {item.remainingSessions > 1
                              ? t("remainingSessionsPlural", {
                                  count: item.remainingSessions,
                                })
                              : t("remainingSessions", {
                                  count: item.remainingSessions,
                                })}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                        <span className="font-medium text-gray-800">
                          {item.className}
                        </span>
                        <span>•</span>
                        <span>{item.teacherName}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-surface-subtle px-1.5 py-0.5 rounded border border-border/60">
                          <Calendar className="w-3 h-3" />
                          {item.lessonTime}
                        </span>
                      </div>
                    </div>

                    {/* Right: Trigger Payment Voucher Creation Form Modal directly */}
                    <div className="shrink-0 flex items-center">
                      <Button
                        size="sm"
                        variant={
                          isUnpaid
                            ? "danger"
                            : isLastSession
                            ? "outline"
                            : "ghost"
                        }
                        leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                        onClick={() => setPaymentModal({ isOpen: true, item })}
                      >
                        {t("recordPayment")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Voucher Creation Form Modal */}
      {paymentModal.isOpen && paymentModal.item && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 font-sans"
          onClick={() => setPaymentModal({ isOpen: false, item: null })}
        >
          <div
            className="bg-white rounded-xl shadow-2xl relative w-full max-w-md max-h-[92vh] overflow-y-auto border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPaymentModal({ isOpen: false, item: null })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 z-10 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <PaymentForm
              student={paymentModal.item.studentData}
              classData={paymentModal.item.classData}
              setOpen={(open) => {
                if (!open) {
                  setPaymentModal({ isOpen: false, item: null });
                }
              }}
              type="create"
            />
          </div>
        </div>
      )}
    </>
  );
}
