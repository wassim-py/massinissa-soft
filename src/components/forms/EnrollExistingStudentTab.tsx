"use client";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { searchStudentsForEnrollmentAction, enrollStudentInClassAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Search, X, UserCheck, CreditCard, Loader2 } from "lucide-react";

interface CandidateStudent {
  id: string;
  globalNumber: number;
  name: string;
  phone: string | null;
  branchName: string;
  classes: string[];
  isAlreadyEnrolled: boolean;
}

interface EnrollExistingStudentTabProps {
  classId: number;
  className: string;
  onSuccess?: (student?: any) => void;
  onEnrollAndPay?: (student: any) => void;
  onClose?: () => void;
  initialSelectedStudent?: any;
}

export default function EnrollExistingStudentTab({
  classId,
  className,
  onSuccess,
  onEnrollAndPay,
  onClose,
  initialSelectedStudent,
}: EnrollExistingStudentTabProps) {
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [query, setQuery] = useState(
    initialSelectedStudent ? initialSelectedStudent.name || String(initialSelectedStudent.globalNumber) : ""
  );
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [enrollingStudentId, setEnrollingStudentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search when debouncedQuery changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setCandidates([]);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    searchStudentsForEnrollmentAction({ query: trimmed, classId })
      .then((res) => {
        if (isMounted && res.success) {
          setCandidates(res.candidates);
        }
      })
      .catch((err) => {
        if (isMounted) console.error("Search error:", err);
      })
      .finally(() => {
        if (isMounted) setIsSearching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, classId]);

  const handleEnroll = (student: CandidateStudent, andPay = false) => {
    setEnrollingStudentId(student.id);

    startTransition(async () => {
      try {
        const res = await enrollStudentInClassAction({
          studentId: student.id,
          classId,
        });

        if (res.success) {
          toast.success(res.message);
          if (andPay && onEnrollAndPay) {
            onEnrollAndPay(res.student || student);
          } else if (onSuccess) {
            onSuccess(res.student || student);
          }
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de l'inscription");
      } finally {
        setEnrollingStudentId(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 font-sans">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-title font-bold text-gray-900">
          {locale === "ar"
            ? `تسجيل تلميذ مسجل مسبقاً في ${className}`
            : `Inscrire un élève existant dans ${className}`}
        </h2>
        <p className="text-xs text-muted">
          {locale === "ar"
            ? "ابحث عن التلميذ بالاسم أو اللقب أو رقم المعرف أو الهاتف لإضافته مباشرة إلى هذا الفوج"
            : "Recherchez l'élève par nom, prénom, N° ID ou téléphone pour l'ajouter directement à ce groupe."}
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="relative flex items-center w-full">
        <Search className="w-4 h-4 text-muted absolute start-3 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            locale === "ar"
              ? "ابحث بالاسم، اللقب، رقم المعرف (#123) أو الهاتف..."
              : "Rechercher par nom, prénom, N° ID (#123) ou téléphone..."
          }
          className="w-full ps-9 pe-9 py-2.5 text-sm bg-surface rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-900 placeholder:text-muted"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute end-2.5 p-1 rounded-lg text-muted hover:text-gray-700 hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Results */}
      <div className="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto pe-1">
        {isSearching && (
          <div className="p-6 text-center text-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">
              {locale === "ar" ? "جاري البحث..." : "Recherche en cours..."}
            </span>
          </div>
        )}

        {!isSearching && debouncedQuery.trim() && candidates.length === 0 && (
          <div className="p-6 text-center bg-surface-subtle/50 rounded-xl border border-dashed border-border text-muted">
            <p className="text-xs font-medium">
              {locale === "ar"
                ? `لم يتم العثور على أي تلميذ يطابق "${debouncedQuery}".`
                : `Aucun élève trouvé correspondant à "${debouncedQuery}".`}
            </p>
          </div>
        )}

        {!isSearching && !debouncedQuery.trim() && (
          <div className="p-6 text-center bg-surface-subtle/30 rounded-xl border border-dashed border-border/80 text-muted">
            <p className="text-xs">
              {locale === "ar"
                ? "ابدأ بكتابة اسم التلميذ أو لقبه لعرض النتائج."
                : "Tapez le nom ou le prénom de l'élève pour afficher les résultats."}
            </p>
          </div>
        )}

        {!isSearching &&
          candidates.map((student) => {
            const isCurrentEnrolling = enrollingStudentId === student.id;

            return (
              <div
                key={student.id}
                className="p-3.5 rounded-xl border border-border bg-surface hover:border-gray-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 select-none border border-primary/20">
                    <span className="font-mono">#{student.globalNumber}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{student.name}</span>
                      <Badge variant="neutral" size="sm">
                        {student.branchName}
                      </Badge>
                      {student.isAlreadyEnrolled && (
                        <Badge variant="primary" size="sm" withDot>
                          {locale === "ar" ? "مسجل بهذا الفوج" : "Déjà dans ce groupe"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                      {student.phone && (
                        <span className="font-mono text-[11px] text-gray-600">
                          {student.phone}
                        </span>
                      )}
                      {student.classes.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-[11px] text-gray-500">
                            {locale === "ar"
                              ? `الأفواج: ${student.classes.join(", ")}`
                              : `Groupes : ${student.classes.join(", ")}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {student.isAlreadyEnrolled ? (
                    <span className="text-xs text-muted font-medium px-2.5 py-1 bg-surface-subtle rounded-lg">
                      {locale === "ar" ? "مسجل بالفعل" : "Déjà inscrit"}
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isCurrentEnrolling}
                        isLoading={isCurrentEnrolling}
                        onClick={() => handleEnroll(student, false)}
                        leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                      >
                        {locale === "ar" ? "تسجيل فقط" : "Inscrire"}
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={isCurrentEnrolling}
                        isLoading={isCurrentEnrolling}
                        onClick={() => handleEnroll(student, true)}
                        className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                        leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                      >
                        {locale === "ar" ? "تسجيل ودفع" : "Inscrire & Payer"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
