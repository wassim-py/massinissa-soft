"use client";

import { useState } from "react";
import Image from "next/image";
import EnrollStudentModal from "./EnrollStudentModal";
import FormationPaymentModal from "./FormationPaymentModal";
import RecordLevelTestModal from "./RecordLevelTestModal";
import AssistedLevelUpModal from "./AssistedLevelUpModal";
import RetakeLevelModal from "./RetakeLevelModal";
import StudentProgressionModal from "./StudentProgressionModal";
import DeleteStudentFromFormationModal from "./DeleteStudentFromFormationModal";
import RefundForm from "@/components/forms/RefundForm";
import PrintTicketButton from "@/components/PrintTicketButton";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export default function FormationRoster({
  formationClass,
  formationLevel,
  nextLevel,
  availableNextGroups = [],
  enrolledStudents,
  allStudents = [],
  role = "admin",
}: {
  formationClass: {
    id: number;
    name: string;
    hasBooks: boolean;
    bookFee?: number | any;
    branchId: number;
    branch?: { name: string };
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
  } | null;
  availableNextGroups?: any[];
  enrolledStudents: Array<{
    id: number;
    enrolledAt: Date | string;
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

  const levelPrice = Number(formationLevel?.lumpSumPrice || 0);

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
          {role === "admin" && (
            <button
              onClick={() => setIsEnrollModalOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-wsmYellow hover:opacity-90 transition-opacity"
              title={t("enrollStudent")}
            >
              <Image src="/create.png" alt={t("enrollStudent")} width={16} height={16} />
            </button>
          )}
        </div>

        {/* STUDENTS LIST */}
        {enrolledStudents.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">
            {t("noStudentsEnrolled")}
          </p>
        ) : (
          <div className="space-y-3">
            {enrolledStudents.map((enr) => {
              const student = enr.student;
              const vouchers = enr.vouchers || [];
              const tests = enr.levelTests || [];
              const latestTest = tests[tests.length - 1];

              const totalPaid = vouchers.reduce((sum, v) => {
                if (v.isVoided) return sum;
                const paid = Number(v.amount || 0);
                const refunded = (v.refunds || []).reduce(
                  (rSum: number, r: any) => rSum + Number(r.amount || 0),
                  0
                );
                return sum + (paid - refunded);
              }, 0);

              const isPaidInFull = totalPaid >= levelPrice;
              const amountOwed = Math.max(0, levelPrice - totalPaid);
              const isRetake = latestTest && !latestTest.passed;

              const idDisplay =
                student.globalNumber !== undefined && student.globalNumber !== null
                  ? `#${student.globalNumber}`
                  : `#${student.id.length > 5 ? student.id.slice(0, 4) : student.id}`;

              return (
                <div key={enr.id} className="bg-gray-50 rounded-md border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3">
                    <div className="flex items-center gap-3 flex-grow min-w-0">
                      <div
                        className="w-9 h-9 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 font-mono text-xs font-bold tracking-tight select-none shadow-2xs"
                        title={`ID: #${student.globalNumber ?? student.id}`}
                      >
                        {idDisplay}
                      </div>
                      <div>
                        <p className="font-medium">{student.name}</p>
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
                                  amount: levelPrice.toLocaleString(
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
                                student,
                                totalPaid,
                                amountOwed,
                                isRetake,
                                previousVouchers: vouchers,
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
                                    <td className="p-2 text-gray-500 font-mono text-start">
                                      {new Date(v.issuedAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ")}
                                    </td>
                                    <td className="p-2 text-center">
                                      <PrintTicketButton
                                        voucher={{
                                          id: v.id,
                                          number: v.number,
                                          amount: v.amount,
                                          paymentType: v.paymentType || "FORMATION",
                                          student: {
                                            name: student.name,
                                            phone: student.phone,
                                          },
                                          class: {
                                            name: formationClass.name,
                                            isFormation: true,
                                            branch: formationClass.branch,
                                          },
                                          issuedAt: v.issuedAt,
                                          series: v.series,
                                        } as any}
                                        amountOwedByStudent={amountOwed}
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
            router.refresh();
          }}
          formationClass={formationClass}
          students={allStudents}
        />
      )}

      {/* PAYMENT MODAL */}
      {paymentModalState.isOpen && paymentModalState.student && (
        <FormationPaymentModal
          isOpen={paymentModalState.isOpen}
          onClose={() =>
            setPaymentModalState({ isOpen: false })
          }
          student={paymentModalState.student}
          formationClass={formationClass}
          formationLevel={formationLevel}
          totalPaid={paymentModalState.totalPaid || 0}
          amountOwed={paymentModalState.amountOwed || 0}
          isRetake={paymentModalState.isRetake}
          previousVouchers={paymentModalState.previousVouchers || []}
          onPaymentSuccess={() => {
            setPaymentModalState({ isOpen: false });
            router.refresh();
          }}
        />
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
