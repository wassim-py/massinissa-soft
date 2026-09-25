"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Clock,
  CheckCircle2,
  UserCheck,
  Building,
  Lock,
  MapPin,
} from "lucide-react";

export interface DashboardLessonItem {
  id: number;
  branchId: number;
  branchName: string;
  startsAt: string; // ISO format
  endsAt: string; // ISO format
  className: string;
  teacherName: string;
  classroomName: string;
  isExtra: boolean;
  isCatchUp: boolean;
  isFree: boolean;
  otherBranches?: string[];
  canTakeAttendance: boolean;
}

interface UpcomingLessonsProps {
  initialLessons: DashboardLessonItem[];
  activeBranchId: number;
  activeBranchName: string;
}

export default function UpcomingLessons({
  initialLessons,
  activeBranchId,
  activeBranchName,
}: UpcomingLessonsProps) {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"upcoming" | "all">("upcoming");
  const hasMyBranchLessons = initialLessons.some(
    (l) => l.branchId === activeBranchId
  );
  const [branchFilter, setBranchFilter] = useState<"my_branch" | "all">(
    hasMyBranchLessons ? "my_branch" : "all"
  );
  const t = useTranslations("dashboard.upcomingLessons");
  const locale = useLocale();

  // Heartbeat timer updating every 15 seconds so lessons move out of upcoming as time passes
  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);


  // Filter lessons by branch if selected
  const branchFilteredLessons = initialLessons.filter((l) =>
    branchFilter === "my_branch" ? l.branchId === activeBranchId : true
  );

  // All lessons passed from admin dashboard are strictly for TODAY
  const allTodayLessons = branchFilteredLessons;

  // Filter lessons that have not ended yet (endsAt > currentTime)
  const upcomingLessons = branchFilteredLessons.filter(
    (l) => currentTime === 0 || new Date(l.endsAt).getTime() > currentTime
  );

  const displayedLessons =
    viewMode === "upcoming" ? upcomingLessons : allTodayLessons;

  // Relative time helper
  const getRelativeTime = (startsAtStr: string) => {
    if (!currentTime) return "";
    const diffMs = new Date(startsAtStr).getTime() - currentTime;
    if (diffMs <= 0) return t("inProgress");
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
      return t("startsIn", { time: `${diffMins}m` });
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return t("startsIn", {
      time: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`,
    });
  };

  const formatTimeSlot = (startsAtStr: string, endsAtStr: string) => {
    const start = new Date(startsAtStr);
    const end = new Date(endsAtStr);
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    };
    return `${start.toLocaleTimeString("en-GB", timeOptions)} - ${end.toLocaleTimeString("en-GB", timeOptions)}`;
  };

  const hasMultipleBranchesInLessons = initialLessons.some(
    (l) => l.branchId !== activeBranchId
  );

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="flex flex-col gap-2.5 pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>{t("title")}</span>
              <Badge variant="primary" size="sm">
                {upcomingLessons.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted mt-0.5">{t("subtitle")}</p>
          </div>

          {/* View mode toggle (Upcoming vs All Today) */}
          <div className="flex items-center bg-surface-subtle p-0.5 rounded-lg border border-border/80 text-xs">
            <button
              onClick={() => setViewMode("upcoming")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewMode === "upcoming"
                  ? "bg-surface text-primary shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              {t("upcomingOnly")} ({upcomingLessons.length})
            </button>
            <button
              onClick={() => setViewMode("all")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewMode === "all"
                  ? "bg-surface text-primary shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              {t("allToday")} ({allTodayLessons.length})
            </button>
          </div>
        </div>

        {/* Branch filter if other branch lessons exist */}
        {hasMultipleBranchesInLessons && (
          <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/60">
            <span className="text-muted font-medium flex items-center gap-1">
              <Building className="w-3.5 h-3.5" />
              <span>Filtrer :</span>
            </span>
            <div className="flex items-center gap-1 bg-surface-subtle p-0.5 rounded-md border border-border/60">
              <button
                onClick={() => setBranchFilter("my_branch")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  branchFilter === "my_branch"
                    ? "bg-surface text-primary font-bold shadow-xs"
                    : "text-muted hover:text-gray-900"
                }`}
              >
                {t("myBranchOnly", { branch: activeBranchName })}
              </button>
              <button
                onClick={() => setBranchFilter("all")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  branchFilter === "all"
                    ? "bg-surface text-primary font-bold shadow-xs"
                    : "text-muted hover:text-gray-900"
                }`}
              >
                {t("allBranches")} ({initialLessons.length})
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {displayedLessons.length === 0 ? (
          <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/80" />
            <p className="text-sm font-medium text-gray-700">
              {t("noUpcoming")}
            </p>
          </div>
        ) : (
          displayedLessons.map((lesson) => {
            const hasStarted =
              currentTime > 0 &&
              new Date(lesson.startsAt).getTime() <= currentTime;
            const hasEnded =
              currentTime > 0 &&
              new Date(lesson.endsAt).getTime() <= currentTime;
            const isDifferentBranch = lesson.branchId !== activeBranchId;

            return (
              <div
                key={lesson.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  hasEnded
                    ? "bg-surface-subtle/40 border-border/50 opacity-60"
                    : hasStarted
                    ? "bg-amber-50/40 border-amber-200/80"
                    : "bg-surface border-border hover:border-primary/40 hover:shadow-xs"
                }`}
              >
                {/* Left: Lesson info */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-900 bg-surface-subtle px-2 py-0.5 rounded border border-border/80">
                      {formatTimeSlot(lesson.startsAt, lesson.endsAt)}
                    </span>
                    <Badge
                      variant={
                        hasEnded
                          ? "neutral"
                          : hasStarted
                          ? "warning"
                          : "primary"
                      }
                      size="sm"
                      withDot={!hasEnded}
                    >
                      {hasEnded
                        ? locale === "ar"
                          ? "انتهت"
                          : "Terminée"
                        : getRelativeTime(lesson.startsAt)}
                    </Badge>

                    {/* Branch Badge if viewing all branches or if from different branch */}
                    {(branchFilter === "all" || isDifferentBranch) && (
                      <Badge
                        variant={isDifferentBranch ? "warning" : "neutral"}
                        size="sm"
                      >
                        <Building className="w-3 h-3 mr-1 inline" />
                        {lesson.branchName}
                      </Badge>
                    )}

                    {lesson.isExtra && (
                      <Badge variant="accent" size="sm">
                        {t("extra")}
                      </Badge>
                    )}
                    {lesson.isCatchUp && (
                      <Badge variant="secondary" size="sm">
                        {t("catchUp")}
                      </Badge>
                    )}
                    {lesson.isFree && (
                      <Badge variant="success" size="sm">
                        {t("free")}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-gray-900 truncate">
                      {lesson.className}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted mt-0.5 flex-wrap">
                      <span>
                        <strong className="text-gray-700">
                          {t("teacher")}:
                        </strong>{" "}
                        {lesson.teacherName}
                        {lesson.otherBranches &&
                          lesson.otherBranches.length > 0 && (
                            <span className="text-[11px] text-amber-700 font-normal ms-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                              {t("sharedTeacherNotice", {
                                branches: lesson.otherBranches.join(", "),
                              })}
                            </span>
                          )}
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-gray-700">
                          {t("room")}:
                        </strong>{" "}
                        {lesson.classroomName || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Take Attendance button ONLY for logged-in branch */}
                <div className="shrink-0 flex items-center">
                  {lesson.canTakeAttendance ? (
                    <Link href={`/list/attendance/take/${lesson.id}`}>
                      <Button
                        size="sm"
                        variant={hasEnded ? "outline" : "primary"}
                        leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                      >
                        {t("takeAttendance")}
                      </Button>
                    </Link>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-xs text-muted bg-surface-subtle border border-border/80 px-2.5 py-1.5 rounded-lg font-medium">
                      <Lock className="w-3.5 h-3.5 text-muted-dark" />
                      <span>
                        {t("otherBranchReadOnly", {
                          branch: lesson.branchName,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
