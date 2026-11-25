"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import EnrollStudentModal from "./EnrollStudentModal";
import PaymentForm from "@/components/forms/PaymentForm";
import { X, UserPlus, ArrowRightLeft } from "lucide-react";
import RecordLevelTestModal from "./RecordLevelTestModal";
import AssistedLevelUpModal from "./AssistedLevelUpModal";
import RetakeLevelModal from "./RetakeLevelModal";
import StudentProgressionModal from "./StudentProgressionModal";
import DeleteStudentFromFormationModal from "./DeleteStudentFromFormationModal";
import TransferFormationGroupModal from "./TransferFormationGroupModal";
import FormationGroupModal from "./FormationGroupModal";
import RefundForm from "@/components/forms/RefundForm";
import PrintTicketButton from "@/components/PrintTicketButton";
import {
  formatVoucherDisplay,
  formatPaymentDate,
  formatPaymentTime,
} from "@/lib/voucherUtils";
import { computeStudentSessionFee, formatDiscountBadgeLabel } from "@/lib/studentBilling";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export default function FormationRoster({
  formationClass,
  formationLevel,
  nextLevel,
  availableNextGroups = [],
  sameLevelActiveGroups = [],
  branches = [],
  teachers = [],
  enrolledStudents,
  allStudents = [],
  studentRelatedData = { grades: [], classes: [] },
  canCreateStudent = true,
  role = "admin",
}: {
  formationClass: {
    id: number;
    name: string;
    hasBooks: boolean;
    bookFee?: number | any;
    branchId: number;
    branch?: { name: string };
    ageGroup?: string | null;
    isPaused?: boolean;
    isCompleted?: boolean;
  };
  formationLevel: {
    id: number;
    name: string;
    levelNumber: number;
    lumpSumPrice: number | any;
    languageId: number;
    Language?: { id: number; name: string };
  };
  nextLevel?: {
    id: number;
    name: string;
    levelNumber: number;
    lumpSumPrice?: number | any;
  } | null;
  availableNextGroups?: any[];
  sameLevelActiveGroups?: any[];
  branches?: Array<{ id: number; name: string }>;
  teachers?: Array<{ id: string; name: string }>;
  enrolledStudents: Array<{
    id: number;
    enrolledAt: Date | string;
    hasNeverAttended?: boolean;
    payerStatus?: string;
    discountType?: string | null;
    discountValue?: number | null;
    discountReason?: string | null;
    student: {
      id: string;
      globalNumber?: number;
      name: string;
      phone?: string | null;
    };
    vouchers: any[];
    levelTests: any[];
  }>;
  allStudents?: Array<{ id: string; name: string; phone?: string | null }>;
  studentRelatedData?: {
    grades: Array<{ id: number; level?: string; name?: string }>;
    classes: Array<{ id: number; name: string; levelId?: number | null }>;
  };
  canCreateStudent?: boolean;
  role?: string;
}) {
  const router = useRouter();
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [visibleHistory, setVisibleHistory] = useState<string | null>(null);

  // Modals state
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    student?: any;
    totalPaid?: number;
    amountOwed?: number;
    isRetake?: boolean;
    previousVouchers?: any[];
    isBookPaid?: boolean;
  }>({ isOpen: false });

  const [testModalState, setTestModalState] = useState<{
    isOpen: boolean;
    student?: any;
  }>({ isOpen: false });

  const [levelUpModalState, setLevelUpModalState] = useState<{
    isOpen: boolean;
    student?: any;
    levelTest?: any;
  }>({ isOpen: false });

  const [retakeModalState, setRetakeModalState] = useState<{
    isOpen: boolean;
    student?: any;
  }>({ isOpen: false });

  const [progressionStudentId, setProgressionStudentId] = useState<string | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    enrollments: Array<{
      enrollmentId: number;
      studentId: string;
      studentName: string;
      totalPaid: number;
    }>;
  }>({ isOpen: false, enrollments: [] });

  const [transferModalState, setTransferModalState] = useState<{
    isOpen: boolean;
    enrollmentId?: number;
    student?: any;
    totalPaid?: number;
    latestTest?: any;
  }>({ isOpen: false });

  const [isCreateNextGroupOpen, setIsCreateNextGroupOpen] = useState(false);

  const levelPrice = Number(formationLevel?.lumpSumPrice || 0);
  const isGroupInactive = Boolean(formationClass.isPaused || formationClass.isCompleted);

  const toggleHistory = (studentId: string) => {
    setVisibleHistory((prev) => (prev === studentId ? null : studentId));
  };

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {t("enrolledStudents", { count: enrolledStudents.length })}
          </h2>
          {(canCreateStudent || role === "admin") && !isGroupInactive && (
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>{locale === "ar" ? "إضافة تلميذ" : "Ajouter un élève"}</span>
            </button>
          )}
        </div>

        {/* STUDENTS LIST */}
        {enrolledStudents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-3">
              {t("noStudentsEnrolled")}
            </p>
            {(canCreateStudent || role === "admin") && !isGroupInactive && (
              <button
                type="button"
                onClick={() => setIsEnrollModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>{locale === "ar" ? "إضافة تلميذ" : "Ajouter un élève"}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {enrolledStudents.map((enr) => {
              const student = enr.student;
              const vouchers = enr.vouchers || [];
              const tests = enr.levelTests || [];
              const latestTest = tests[tests.length - 1];

              const totalPaid = vouchers.reduce((sum, v) => {
                if (v.isVoided) return sum;
                if (v.paymentType === "BOOK" || v.paymentType === "INSCRIPTION") return sum;
                const paid = Number(v.amount || 0);
                const refunded = (v.refunds || []).reduce(
                  (rSum: number, r: any) => rSum + Number(r.amount || 0),
                  0
                );
                return sum + (paid - refunded);
              }, 0);

              const enrPayerStatus = (enr as any).payerStatus || "NORMAL";
              const enrDiscountType = (enr as any).discountType || null;
              const enrDiscountValue = (enr as any).discountValue != null ? Number((enr as any).discountValue) : null;
              const studentLevelPrice = computeStudentSessionFee({
                pricePerCycle: levelPrice,
                isFormation: true,
                payerStatus: enrPayerStatus,
                discountType: enrDiscountType,
                discountValue: enrDiscountValue,
              }).studentCycleFee;
              const isDiscounted = enrPayerStatus === "DISCOUNTED";
              const discountBadgeLabel = isDiscounted
                ? formatDiscountBadgeLabel(
                    enrDiscountType,
                    enrDiscountValue,
                    locale === "ar" ? "ar" : "fr"
                  )
                : null;

              const isPaidInFull =
                (studentLevelPrice === 0 && (enrPayerStatus === "NON_PAYER" || isDiscounted)) ||
                totalPaid >= studentLevelPrice;
              const amountOwed = Math.max(0, studentLevelPrice - totalPaid);
              const isRetake = latestTest && !latestTest.passed;
              const isBookPaid = vouchers.some(
                (v) => v.paymentType === "BOOK" && !v.isVoided
              );

              const idDisplay =
                student.globalNumber !== undefined && student.globalNumber !== null
                  ? `#${student.globalNumber}`
                  : `#${student.id.length > 5 ? student.id.slice(0, 4) : student.id}`;

              return (
                <div key={enr.id} className="bg-gray-50 rounded-md border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3">
                    <div className="flex items-center gap-3 flex-grow min-w-0">
                      <Link
                        href={`/list/students/${student.id}`}
                        className="w-9 h-9 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 font-mono text-xs font-bold tracking-tight select-none shadow-2xs hover:border-primary transition-colors cursor-pointer"
                        title={`ID: #${student.globalNumber ?? student.id}`}
                      >
                        {idDisplay}
                      </Link>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/list/students/${student.id}`}
                            className="font-medium text-gray-900 hover:text-primary hover:underline transition-colors block"
                          >
                            {student.name}
                          </Link>
                          {isDiscounted && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-900 border border-violet-300 shadow-2xs">
                              {locale === "ar"
                                ? `مخفّض${discountBadgeLabel ? ` (${discountBadgeLabel})` : ""}`
                                : `Remise${discountBadgeLabel ? ` (${discountBadgeLabel})` : ""}`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`font-semibold ${
                              isPaidInFull ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {isRetake
                              ? t("retakeNotice")
                              : isPaidInFull
                              ? t("paidInFull")
                              : totalPaid > 0
                              ? t("remainingBalance", {
                                  amount: amountOwed.toLocaleString(
                                    locale === "ar" ? "ar-DZ" : "fr-DZ"
                                  ),
                                 })
                              : t("remainingBalance", {
                                  amount: studentLevelPrice.toLocaleString(
                                    locale === "ar" ? "ar-DZ" : "fr-DZ"
                                  ),
                                 })}
                          </span>
                          {latestTest && (
                            <span
                              className={`font-semibold ${
                                latestTest.passed ? "text-green-600" : "text-amber-600"
                              }`}
                            >
                              • {latestTest.passed ? t("passed") : t("failed")}{" "}
                              {latestTest.score !== null ? `(${latestTest.score}/100)` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      <button
                        onClick={() => toggleHistory(student.id)}
                        className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300"
                      >
                        {visibleHistory === student.id ? t("hideHistory") : t("showHistory")}
                      </button>

                      {role === "admin" && (
                        <>
                          <button
                            onClick={() =>
                              setPaymentModalState({
                                isOpen: true,
                                student: {
                                  ...student,
                                  enrollments: [
                                    {
                                      id: enr.id,
                                      classId: formationClass.id,
                                      payerStatus: enrPayerStatus,
                                      discountType: enrDiscountType,
                                      discountValue: enrDiscountValue,
                                      discountReason: (enr as any).discountReason || null,
                                    },
                                  ],
                                },
                                totalPaid,
                                amountOwed: isRetake ? studentLevelPrice : amountOwed,
                                isRetake,
                                previousVouchers: vouchers,
                                isBookPaid,
                              })
                            }
                            className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
                          >
                            {t("pay")}
                          </button>

                          <button
                            onClick={() => setTestModalState({ isOpen: true, student })}
                            className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full hover:bg-purple-200"
                          >
                            {t("levelTest")}
                          </button>

                          {latestTest?.passed && (
                            <button
                              onClick={() =>
                                setLevelUpModalState({
                                  isOpen: true,
                                  student,
                                  levelTest: latestTest,
                                })
                              }
                              className="px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full hover:bg-emerald-200"
                            >
                              {t("levelUp")}
                            </button>
                          )}

                          {isRetake && (
                            <button
                              onClick={() => setRetakeModalState({ isOpen: true, student })}
                              className="px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200"
                            >
                              {t("retake")}
                            </button>
                          )}

                          {sameLevelActiveGroups.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setTransferModalState({
                                  isOpen: true,
                                  enrollmentId: enr.id,
                                  student,
                                  totalPaid,
                                  latestTest: latestTest || null,
                                })
                              }
                              title={t("switchStudentGroup")}
                              className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full hover:bg-indigo-100 inline-flex items-center gap-1"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>{t("switchStudentGroup")}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setDeleteModalState({
                                isOpen: true,
                                enrollments: [
                                  {
                                    enrollmentId: enr.id,
                                    studentId: student.id,
                                    studentName: student.name,
                                    totalPaid,
                                  },
                                ],
                              })
                            }
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-wsmPurple hover:opacity-80 transition-opacity shrink-0"
                            title={t("deleteStudentFromLevel")}
                          >
                            <Image src="/delete.png" alt={t("deleteStudentFromLevel")} width={14} height={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* HISTORY SECTION */}
                  {visibleHistory === student.id && (
                    <div className="p-4 border-t text-sm space-y-3 bg-white">
                      <div className="flex justify-between items-center py-1">
                        <span className="font-semibold text-gray-700">{t("totalPreviouslyPaid")}</span>
                        <span className="font-bold text-green-700 font-mono">
                          {totalPaid.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                        </span>
                      </div>

                      {vouchers.length > 0 ? (
                        <div className="overflow-x-auto mt-2">
                          <table className="min-w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-100 text-gray-600 border-b">
                                <th className="p-2 text-start">{t("colVoucherNumber")}</th>
                                <th className="p-2 text-start">{t("paymentAmount")}</th>
                                <th className="p-2 text-start">{t("colType")}</th>
                                <th className="p-2 text-start">{t("colDate")}</th>
                                <th className="p-2 text-center">{t("printReceipt")}</th>
                                <th className="p-2 text-center">{t("refundReceipt")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {vouchers.map((v) => {
                                const isFormationVoucher = v.paymentType === "FORMATION";
                                const isBookVoucher = v.paymentType === "BOOK";
                                const voucherDisplay = formatVoucherDisplay(
                                  {
                                    ...v,
                                    class: {
                                      name: formationClass.name,
                                      isFormation: true,
                                      branch: formationClass.branch,
                                    },
                                    series: v.series,
                                  },
                                  {
                                    branchName: formationClass.branch?.name,
                                    isFormation: isFormationVoucher,
                                    paymentType: v.paymentType || "FORMATION",
                                  }
                                );

                                return (
                                  <tr key={v.id} className="hover:bg-gray-50">
                                    <td className="p-2 font-bold text-blue-600 font-mono text-start">
                                      {voucherDisplay}
                                    </td>
                                    <td className="p-2 font-medium font-mono text-start">
                                      {Number(v.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                                    </td>
                                    <td className="p-2 text-start">
                                      {isBookVoucher ? (
                                        <span className="text-purple-700 font-semibold">
                                          {t("bookFeePaymentOption")}
                                        </span>
                                      ) : v.paymentType === "INSCRIPTION" ? (
                                        <span className="text-blue-700 font-semibold">
                                          {locale === "ar" ? "حقوق التسجيل" : "Frais d'inscription"}
                                        </span>
                                      ) : v.isPartial ? (
                                        <span className="text-amber-700 font-semibold">
                                          {t("partial")}
                                        </span>
                                      ) : (
                                        <span className="text-green-700 font-semibold">
                                          {t("full")}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2 text-gray-500 font-mono text-start whitespace-nowrap" dir="ltr">
                                      <div>{formatPaymentDate(v.issuedAt)}</div>
                                      {(() => {
                                        const time = formatPaymentTime(v.issuedAt);
                                        return time && time !== "00:00" && time !== "12:00" ? (
                                          <div className="text-[10px] text-gray-400">{time}</div>
                                        ) : null;
                                      })()}
                                    </td>
                                    <td className="p-2 text-center">
                                      <PrintTicketButton
                                        voucher={{
                                          ...v,
                                          id: v.id,
                                          number: v.number,
                                          amount: v.amount,
                                          paymentType: v.paymentType || "FORMATION",
                                          student: {
                                            id: student.id,
                                            globalNumber: student.globalNumber,
                                            name: student.name,
                                            phone: student.phone,
                                          },
                                          class: {
                                            id: formationClass.id,
                                            name: formationClass.name,
                                            isFormation: true,
                                            branch: formationClass.branch,
                                          },
                                          issuedAt: v.issuedAt,
                                          series: v.series,
                                        } as any}
                                        cycleRemainingFee={
                                          isFormationVoucher && amountOwed > 0
                                            ? amountOwed
                                            : undefined
                                        }
                                        amountOwedByStudent={amountOwed}
                                        isPartial={
                                          Boolean(v.isPartial) ||
                                          (isFormationVoucher && amountOwed > 0)
                                        }
                                      />
                                    </td>
                                    <td className="p-2 text-center">
                                      <RefundForm
                                        payment={{
                                          id: v.id,
                                          voucherId: v.id,
                                          amount: v.amount,
                                          refunds: v.refunds || [],
                                          paymentType: v.paymentType || "FORMATION",
                                          hasNeverAttended: enr.hasNeverAttended,
                                        }}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 text-center py-2">
                          {t("noVouchersRecorded")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ENROLL STUDENT MODAL */}
      {isEnrollModalOpen && (
        <EnrollStudentModal
          isOpen={isEnrollModalOpen}
          onClose={() => {
            setIsEnrollModalOpen(false);
          }}
          formationClass={{
            ...formationClass,
            FormationLevel: formationLevel,
          }}
          studentRelatedData={studentRelatedData}
          students={allStudents}
          onSuccess={() => {
            setIsEnrollModalOpen(false);
            router.refresh();
          }}
          onEnrollAndPay={(student) => {
            setIsEnrollModalOpen(false);
            setPaymentModalState({
              isOpen: true,
              student,
              amountOwed: levelPrice,
              isRetake: false,
              isBookPaid: false,
            });
            router.refresh();
          }}
        />
      )}

      {/* PAYMENT MODAL (IDENTICAL TO NORMAL GROUPS) */}
      {paymentModalState.isOpen && paymentModalState.student && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-xl relative w-full max-w-md max-h-[92vh] overflow-y-auto border border-border">
            <button
              type="button"
              onClick={() => setPaymentModalState({ isOpen: false })}
              className="absolute top-4 end-4 text-muted hover:text-gray-900 hover:bg-surface-subtle z-10 p-1.5 rounded-lg transition-colors cursor-pointer"
              aria-label={tCommon("close")}
            >
              <X className="w-5 h-5" />
            </button>
            <PaymentForm
              student={paymentModalState.student}
              classData={{
                ...formationClass,
                isFormation: true,
                pricePerCycle: levelPrice,
              }}
              setOpen={(open) => {
                setPaymentModalState((prev) => ({ ...prev, isOpen: open }));
                if (!open) {
                  router.refresh();
                }
              }}
              type="create"
              amountOwedByStudent={paymentModalState.amountOwed}
              isRetake={paymentModalState.isRetake}
              isBookPaid={paymentModalState.isBookPaid}
              initialNotes={
                paymentModalState.isRetake
                  ? locale === "ar"
                    ? "إعادة المستوى بعد الرسوب في اختبار المستوى"
                    : "Reprise de niveau après échec au test"
                  : ""
              }
            />
          </div>
        </div>
      )}

      {/* LEVEL TEST MODAL */}
      {testModalState.isOpen && testModalState.student && (
        <RecordLevelTestModal
          isOpen={testModalState.isOpen}
          onClose={() => setTestModalState({ isOpen: false })}
          student={testModalState.student}
          formationClass={formationClass}
          formationLevel={formationLevel}
          onTestRecorded={() => {
            setTestModalState({ isOpen: false });
            router.refresh();
          }}
        />
      )}

      {/* ASSISTED LEVEL UP MODAL */}
      {levelUpModalState.isOpen && levelUpModalState.student && (
        <AssistedLevelUpModal
          isOpen={levelUpModalState.isOpen}
          onClose={() => setLevelUpModalState({ isOpen: false })}
          student={levelUpModalState.student}
          levelTest={levelUpModalState.levelTest}
          nextLevel={nextLevel!}
          availableGroups={availableNextGroups}
          onLevelUpSuccess={() => {
            setLevelUpModalState({ isOpen: false });
            router.refresh();
          }}
          onRequestCreateGroup={
            nextLevel ? () => setIsCreateNextGroupOpen(true) : undefined
          }
        />
      )}

      {/* CREATE NEXT-LEVEL GROUP MODAL (FROM ASSISTED LEVEL-UP) */}
      {isCreateNextGroupOpen && nextLevel && (
        <FormationGroupModal
          isOpen={isCreateNextGroupOpen}
          onClose={() => setIsCreateNextGroupOpen(false)}
          mode="create"
          languageName={formationLevel.Language?.name || ""}
          formationLevel={nextLevel}
          existingGroupsCount={availableNextGroups.length}
          defaultBranchId={formationClass.branchId}
          defaultAgeGroup={formationClass.ageGroup}
          branches={branches}
          teachers={teachers}
          onSuccess={() => {
            setIsCreateNextGroupOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* SAME-LEVEL GROUP TRANSFER MODAL */}
      {transferModalState.isOpen &&
        transferModalState.student &&
        transferModalState.enrollmentId && (
          <TransferFormationGroupModal
            isOpen={transferModalState.isOpen}
            onClose={() => setTransferModalState({ isOpen: false })}
            enrollmentId={transferModalState.enrollmentId}
            student={transferModalState.student}
            currentGroup={{
              id: formationClass.id,
              name: formationClass.name,
              branchName: formationClass.branch?.name,
            }}
            formationLevel={{
              id: formationLevel.id,
              name: formationLevel.name,
            }}
            totalPaid={transferModalState.totalPaid || 0}
            latestTest={transferModalState.latestTest || null}
            availableTargetGroups={sameLevelActiveGroups}
            onTransferred={() => {
              setTransferModalState({ isOpen: false });
              router.refresh();
            }}
          />
        )}

      {/* RETAKE LEVEL MODAL */}
      {retakeModalState.isOpen && retakeModalState.student && (
        <RetakeLevelModal
          isOpen={retakeModalState.isOpen}
          onClose={() => setRetakeModalState({ isOpen: false })}
          student={retakeModalState.student}
          formationClass={formationClass}
          formationLevel={formationLevel}
          onRetakeCompleted={() => {
            setRetakeModalState({ isOpen: false });
            router.refresh();
          }}
        />
      )}

      {/* STUDENT PROGRESSION MODAL */}
      {progressionStudentId && (
        <StudentProgressionModal
          isOpen={!!progressionStudentId}
          onClose={() => setProgressionStudentId(null)}
          studentId={progressionStudentId}
          languageId={formationLevel.languageId}
        />
      )}

      {/* DELETE STUDENT FROM FORMATION MODAL */}
      {deleteModalState.isOpen && (
        <DeleteStudentFromFormationModal
          isOpen={deleteModalState.isOpen}
          onClose={() => setDeleteModalState({ isOpen: false, enrollments: [] })}
          classId={formationClass.id}
          enrollments={deleteModalState.enrollments}
        />
      )}
    </>
  );
}
