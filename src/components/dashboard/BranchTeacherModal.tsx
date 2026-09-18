"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Users, X, Calendar, MapPin } from "lucide-react";

export interface BranchTeacherData {
  id: string;
  name: string;
  branches?: string[];
  otherBranches?: string[];
  lessonsTodayCount: number;
}

export interface BranchTeacherModalProps {
  teachers: BranchTeacherData[];
  branchName?: string;
}

export default function BranchTeacherModal({
  teachers,
  branchName,
}: BranchTeacherModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("dashboard.teachersDetail");

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-2 text-xs font-semibold text-primary hover:text-primary-hover hover:underline inline-flex items-center gap-1 transition-colors cursor-pointer"
      >
        <Users className="w-3.5 h-3.5" />
        <span>{t("title")}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="flex flex-col max-h-[85vh] overflow-hidden shadow-xl border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-3 bg-surface-subtle/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-gray-900">
                      {t("title")}
                    </CardTitle>
                    <p className="text-xs text-muted mt-0.5">
                      {t("totalTeachers", { count: teachers.length })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-surface-subtle transition-colors"
                  aria-label={t("close")}
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>

              <CardContent className="p-4 overflow-y-auto space-y-3">
                {teachers.length === 0 ? (
                  <p className="text-sm text-center text-muted py-6">
                    {t("noLessonsToday")}
                  </p>
                ) : (
                  teachers.map((teacher) => {
                    const branchesList = teacher.branches || teacher.otherBranches || [];
                    return (
                      <div
                        key={teacher.id}
                        className="p-3.5 rounded-xl border border-border/70 bg-surface hover:bg-surface-subtle/40 transition-colors flex flex-col gap-2.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-bold text-sm text-gray-900">
                            {teacher.name}
                          </span>
                          {teacher.lessonsTodayCount > 0 ? (
                            <Badge variant="success" size="sm" withDot>
                              <Calendar className="w-3 h-3 mr-1 inline" />
                              {t("lessonsToday", {
                                count: teacher.lessonsTodayCount,
                              })}
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              {t("noLessonsToday")}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          {branchesList.length > 0 ? (
                            <Badge variant="neutral" size="sm">
                              <MapPin className="w-3 h-3 mr-1 inline" />
                              {branchesList.join(", ")}
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              {t("noBranches")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>

              <div className="p-3 border-t border-border/60 bg-surface-subtle/30 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  {t("close")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
