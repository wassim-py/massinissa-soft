"use client";

import React, { useState, useEffect, startTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { voucherSchema, VoucherSchema } from "@/lib/formValidationSchemas";
import {
  issueVoucher,
  editVoucher,
  issueMultiItemVoucherAction,
  checkStudentInscriptionExemptionAction,
} from "@/lib/actions";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Voucher, Student, Class } from "@prisma/client";
import PrintTicketButton from "../PrintTicketButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { computeStudentSessionFee } from "@/lib/studentBilling";
import { CheckCircle2, AlertCircle, Info, Printer } from "lucide-react";

interface ExtendedStudent extends Student {
  family?: { payerStudentId: string | null; discountPercentage?: any } | null;
  enrollments?: Array<{ classId: number; payerStatus?: string }>;
}

const PaymentForm = ({
  student,
  classData,
  type,
  data,
  setOpen,
  sessionsForThisPayment,
  amountOwedByStudent,
  defaultInscriptionFee,
}: {
  student: ExtendedStudent;
  classData: Class;
  type: "create" | "update";
  data?: Voucher;
  setOpen: (isOpen: boolean) => void;
  sessionsForThisPayment?: number;
  amountOwedByStudent?: number;
  defaultInscriptionFee?: number;
}) => {
  const router = useRouter();
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const isSiblingDiscount = Boolean(
    student.family && student.family.payerStudentId && student.family.payerStudentId !== student.id
  );
  const siblingDiscountPct = isSiblingDiscount
    ? Number((student.family as any)?.discountPercentage ?? 50)
    : 0;
  const isSiblingWaived = siblingDiscountPct >= 100;

  const teacherPercentage = (classData as any)?.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
    ? Number((classData as any).teacher.TeacherPayRate[0].percentageOfSessionFee)
    : null;

  const enrollment = (student.enrollments as any[])?.find((e) => e.classId === classData.id);
  const currentPayerStatus = enrollment?.payerStatus || (student as any).payerStatus || "NORMAL";

  const feeCalc = computeStudentSessionFee({
    payerStatus: currentPayerStatus,
    pricePerCycle: Number(classData.pricePerCycle || (classData as any).price || 0),
    teacherPercentage,
    isSiblingWaived,
    siblingDiscountPercentage: siblingDiscountPct,
  });

  const initialConfiguredFee =
    Number(classData.inscriptionFee || 0) > 0
      ? Number(classData.inscriptionFee)
      : (defaultInscriptionFee || 0);

  // State for Multi-Item Creation Form
  const [isTuitionChecked, setIsTuitionChecked] = useState(true);
  const [tuitionAmount, setTuitionAmount] = useState<number>(feeCalc.studentCycleFee);

  const [configuredFee, setConfiguredFee] = useState<number>(initialConfiguredFee);
  const [isInscriptionChecked, setIsInscriptionChecked] = useState(false);
  const [inscriptionAmount, setInscriptionAmount] = useState<number | string>(
    initialConfiguredFee > 0 ? initialConfiguredFee : ""
  );

  const [isBookChecked, setIsBookChecked] = useState(false);
  const [bookAmount, setBookAmount] = useState<number>(Number(classData.bookFee || 0));

  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedBundle, setIssuedBundle] = useState<any>(null);

  const [inscriptionStatus, setInscriptionStatus] = useState<{
    isLoading: boolean;
    isAlreadyPaidInThisClass: boolean;
    hasPaidThreeInscriptions: boolean;
    paidGroupsCount: number;
  }>({
    isLoading: true,
    isAlreadyPaidInThisClass: false,
    hasPaidThreeInscriptions: false,
    paidGroupsCount: 0,
  });

  // Check inscription fee exemption (3-group rule) automatically
  useEffect(() => {
    if (type !== "create" || !student?.id || !classData?.id) return;

    let isMounted = true;
    checkStudentInscriptionExemptionAction({
      studentId: student.id,
      classId: classData.id,
    })
      .then((res) => {
        if (isMounted) {
          const fee = res.configuredInscriptionFee || 0;
          setConfiguredFee(fee);
          setInscriptionStatus({
            isLoading: false,
            isAlreadyPaidInThisClass: res.isAlreadyPaidInThisClass,
            hasPaidThreeInscriptions: res.hasPaidThreeInscriptions,
            paidGroupsCount: res.paidGroupsCount,
          });
          // If not paid and not exempt, check inscription by default for convenience
          // and populate the configured inscription fee into the field
          if (!res.isAlreadyPaidInThisClass && !res.hasPaidThreeInscriptions) {
            setIsInscriptionChecked(true);
            setInscriptionAmount(fee);
          } else {
            setIsInscriptionChecked(false);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Inscription check error:", err);
          setInscriptionStatus((prev) => ({ ...prev, isLoading: false }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [student?.id, classData?.id, type]);

  // Compute live total amount
  const parsedTuition = isTuitionChecked ? Math.max(0, Number(tuitionAmount || 0)) : 0;
  const parsedInscNum = Number(inscriptionAmount);
  const parsedInscription =
    isInscriptionChecked &&
    !inscriptionStatus.hasPaidThreeInscriptions &&
    !inscriptionStatus.isAlreadyPaidInThisClass &&
    !isNaN(parsedInscNum) &&
    parsedInscNum > 0
      ? parsedInscNum
      : 0;
  const parsedBook = isBookChecked && classData.hasBooks ? Math.max(0, Number(bookAmount || 0)) : 0;

  const totalAmount = parsedTuition + parsedInscription + parsedBook;

  const handleMultiItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if inscription fee was checked but left empty or <= 0
    const rawInscNum = Number(inscriptionAmount);
    const isInscEmptyOrZero =
      inscriptionAmount === "" || isNaN(rawInscNum) || rawInscNum <= 0;

    let effectiveInscriptionChecked = isInscriptionChecked;
    if (isInscriptionChecked && isInscEmptyOrZero) {
      // Auto uncheck the box and do not save inscription fees at all
      setIsInscriptionChecked(false);
      effectiveInscriptionChecked = false;
    }

    const effectiveTuition = isTuitionChecked ? Math.max(0, Number(tuitionAmount || 0)) : 0;
    const effectiveBook = isBookChecked && classData.hasBooks ? Math.max(0, Number(bookAmount || 0)) : 0;
    const effectiveInscription =
      effectiveInscriptionChecked &&
      !inscriptionStatus.hasPaidThreeInscriptions &&
      !inscriptionStatus.isAlreadyPaidInThisClass &&
      !isInscEmptyOrZero
        ? rawInscNum
        : 0;

    const totalToSubmit = effectiveTuition + effectiveBook + effectiveInscription;

    if (
      totalToSubmit <= 0 &&
      !isSiblingWaived &&
      currentPayerStatus !== "NON_PAYER"
    ) {
      toast.error(
        locale === "ar"
          ? "يرجى تحديد بند واحد على الأقل للدفع بمبلغ صحيح"
          : "Veuillez sélectionner au moins un élément valide à payer"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await issueMultiItemVoucherAction({
        studentId: student.id,
        classId: classData.id,
        items: {
          tuition: isTuitionChecked
            ? { enabled: true, amount: effectiveTuition }
            : undefined,
          inscription: effectiveInscription > 0
            ? { enabled: true, amount: effectiveInscription }
            : undefined,
          book:
            isBookChecked && classData.hasBooks
              ? { enabled: true, amount: effectiveBook }
              : undefined,
        },
        notes,
      });

      if (res.success && res.bundle) {
        toast.success(res.message);
        setIssuedBundle(res.bundle);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erreur de paiement");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Legacy/Update fallback for editing existing voucher
  const {
    register: registerUpdate,
    handleSubmit: handleSubmitUpdate,
    formState: { errors: updateErrors },
  } = useForm<VoucherSchema>({
    resolver: zodResolver(voucherSchema) as any,
    defaultValues: {
      id: data?.id,
      studentId: student.id,
      classId: classData.id,
      paymentType: (data?.paymentType as any) || "TUITION_4SESSION",
      amount: data?.amount ? Number(data.amount) : 0,
      isPartial: data?.isPartial ?? false,
      completesVoucherId: data?.completesVoucherId ?? null,
      remainingBalance: data?.remainingBalance ? Number(data.remainingBalance) : null,
      feeOverriddenByOwner: false,
      feeOverrideNote: "",
    },
  });

  const handleUpdateAction = async (prevState: any, formData: any) => {
    if (!data) return { success: false, error: true, message: "Error" };
    return await editVoucher(prevState, {
      voucherId: data.id,
      fieldName: "amount",
      newValue: String(formData.amount),
      amount: formData.amount,
      paymentType: formData.paymentType,
      reason: formData.notes || "Edited via UI",
    });
  };

  const [updateState, updateFormAction, isUpdatePending] = useActionState(handleUpdateAction, {
    success: false,
    error: false,
    message: "",
  });

  useEffect(() => {
    if (updateState?.success) {
      toast.success(updateState.message);
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
    }
    if (updateState?.error) {
      toast.error(updateState.message);
    }
  }, [updateState, setOpen, router]);

  // When a voucher bundle was just issued: Success Screen with 1-Click Print Ticket
  if (issuedBundle) {
    return (
      <div className="flex flex-col gap-4 p-5 font-sans">
        <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-bold text-base text-gray-900">
              {locale === "ar"
                ? `تم إصدار الوصل #${issuedBundle.voucherNumber} بنجاح`
                : `Reçu #${issuedBundle.voucherNumber} émis avec succès`}
            </h3>
            <p className="text-xs text-emerald-900">
              {locale === "ar"
                ? `${student.name} • ${classData.name} • ${issuedBundle.totalAmount.toLocaleString()} دج`
                : `${student.name} • ${classData.name} • ${issuedBundle.totalAmount.toLocaleString()} DZD`}
            </p>
          </div>
        </div>

        {/* Breakdown Summary */}
        <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2 text-xs">
          <span className="font-bold text-gray-800">
            {locale === "ar" ? "تفاصيل الوصل الموحد:" : "Détails du reçu unique :"}
          </span>
          <div className="divide-y divide-border/60">
            {issuedBundle.items.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between py-1.5">
                <span className="text-gray-700">
                  {locale === "ar" ? item.labelAr : item.labelFr}
                </span>
                <span className="font-bold font-mono text-gray-900">
                  {Number(item.amount).toLocaleString()} DZD
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t-2 border-border font-bold text-sm">
            <span>{locale === "ar" ? "المجموع الكلي:" : "Total :"}</span>
            <span className="font-mono text-primary">
              {issuedBundle.totalAmount.toLocaleString()} DZD
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setOpen(false)}
            className="flex-1"
          >
            {locale === "ar" ? "إغلاق" : "Fermer"}
          </Button>

          <div className="flex-1">
            <PrintTicketButton
              voucher={{
                ...issuedBundle,
                id: issuedBundle.voucherNumber,
                number: issuedBundle.voucherNumber,
                amount: issuedBundle.totalAmount,
                paymentType: "MULTI_ITEM",
                student,
                class: classData,
                series: { scope: issuedBundle.seriesScope, id: issuedBundle.seriesId },
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // UPDATE MODE
  if (type === "update" && data) {
    return (
      <form
        onSubmit={handleSubmitUpdate((formData) => {
          startTransition(() => {
            updateFormAction(formData as any);
          });
        })}
        className="flex flex-col gap-4 p-5 font-sans"
      >
        <div className="flex justify-between items-center border-b border-border pb-3">
          <h2 className="text-section-title font-bold text-gray-900">
            {`${t("editVoucherModalTitle")} ${formatVoucherDisplay(data, {
              branchName: (classData as any)?.branch?.name || (classData as any)?.branchName,
              levelName: (classData as any)?.level?.name,
            })}`}
          </h2>
          <PrintTicketButton
            voucher={{ ...data, student, class: classData }}
            sessionsForThisPayment={sessionsForThisPayment}
            amountOwedByStudent={amountOwedByStudent}
          />
        </div>

        <input type="hidden" {...registerUpdate("studentId")} />
        <input type="hidden" {...registerUpdate("classId")} />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-700">{t("amountDZD")}</label>
          <input
            type="number"
            step="any"
            {...registerUpdate("amount", { valueAsNumber: true })}
            className="border border-gray-300 p-2 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
          />
          {updateErrors.amount && (
            <p className="text-xs text-red-500">{updateErrors.amount.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isUpdatePending}
          className="w-full"
        >
          {t("saveChangesBtn")}
        </Button>
      </form>
    );
  }

  // CREATE MODE: UNIFIED MULTI-ITEM PAYMENT FORM
  return (
    <form onSubmit={handleMultiItemSubmit} className="flex flex-col gap-4 p-5 font-sans">
      {/* Modal Header */}
      <div className="flex justify-between items-center border-b border-border pb-3">
        <div>
          <h2 className="text-section-title font-bold text-gray-900">
            {locale === "ar" ? "تسجيل دفع وإصدار وصل" : "Émission de reçu de paiement"}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            <span className="font-bold text-gray-800">{student.name}</span> (#{student.globalNumber}) •{" "}
            <span className="text-primary font-semibold">{classData.name}</span>
          </p>
        </div>
      </div>

      {/* Sibling Waiver / Discount Alert */}
      {isSiblingDiscount && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
          <p className="font-bold">
            {locale === "ar"
              ? `تنبيه تخفيض الإخوة (${siblingDiscountPct}%):`
              : `Alerte remise fratrie (${siblingDiscountPct}%) :`}
          </p>
          <p className="mt-0.5">
            {locale === "ar"
              ? isSiblingWaived
                ? "هذا التلميذ معفى بنسبة 100% من معاليم التدريس (0 دج) لوجود دافع رئيسي للعائلة."
                : `يستفيد هذا التلميذ من تخفيض بنسبة ${siblingDiscountPct}% على معاليم الحصص الدراسية (المبلغ المطلوب: ${feeCalc.studentCycleFee.toLocaleString()} دج بدل ${feeCalc.baseCycleFee.toLocaleString()} دج). رسوم التسجيل والكتب تبقى كاملة.`
              : isSiblingWaived
              ? "Cet élève bénéficie d'une exonération à 100% sur les cours (0 DZD)."
              : `Cet élève bénéficie d'une réduction de ${siblingDiscountPct}% sur les cours (${feeCalc.studentCycleFee.toLocaleString()} DZD au lieu de ${feeCalc.baseCycleFee.toLocaleString()} DZD). Frais d'inscription et manuels plein tarif.`}
          </p>
        </div>
      )}

      {/* Payer Status Alerts */}
      {!isSiblingWaived && currentPayerStatus === "NON_PAYER" && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
          <p className="font-bold">
            {locale === "ar"
              ? "حالة التلميذ في هذا الفوج: معفى من الدفع (Non-payer)"
              : "Régime du groupe : Non-payeur (exonéré)"}
          </p>
        </div>
      )}

      {/* Multi-Item Selection Area */}
      <div className="flex flex-col gap-2.5">
        {/* ITEM 1: Studies / Tuition Fee */}
        <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-gray-900 select-none">
              <input
                type="checkbox"
                checked={isTuitionChecked}
                onChange={(e) => setIsTuitionChecked(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary/20 cursor-pointer"
              />
              <span>{locale === "ar" ? "اشتراك دراسي (4 حصص)" : "Cycle d'études (4 séances)"}</span>
            </label>
            <Badge variant="primary" size="sm">
              {classData.name}
            </Badge>
          </div>

          {isTuitionChecked && (
            <div className="flex items-center gap-2 ps-6 pt-1">
              <span className="text-xs text-muted">{locale === "ar" ? "المبلغ:" : "Montant :"}</span>
              <input
                type="number"
                step="any"
                value={tuitionAmount}
                onChange={(e) => setTuitionAmount(e.target.value ? Number(e.target.value) : 0)}
                className="border border-border bg-surface px-2.5 py-1 text-xs rounded-lg font-mono w-32 focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
              <span className="text-xs text-muted font-bold">DZD</span>
            </div>
          )}
        </div>

        {/* ITEM 2: Inscription Fee with 3-Group Rule Auto-Detection */}
        <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              className={`flex items-center gap-2 font-bold text-xs text-gray-900 select-none ${
                inscriptionStatus.hasPaidThreeInscriptions || inscriptionStatus.isAlreadyPaidInThisClass
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                disabled={
                  inscriptionStatus.hasPaidThreeInscriptions ||
                  inscriptionStatus.isAlreadyPaidInThisClass
                }
                checked={
                  isInscriptionChecked &&
                  !inscriptionStatus.hasPaidThreeInscriptions &&
                  !inscriptionStatus.isAlreadyPaidInThisClass
                }
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsInscriptionChecked(checked);
                  if (checked && (!inscriptionAmount || Number(inscriptionAmount) <= 0)) {
                    setInscriptionAmount(configuredFee || Number(classData.inscriptionFee || 0));
                  }
                }}
                className="w-4 h-4 rounded text-primary focus:ring-primary/20 cursor-pointer disabled:cursor-not-allowed"
              />
              <span>{locale === "ar" ? "حقوق التسجيل" : "Frais d'inscription"}</span>
            </label>

            {inscriptionStatus.hasPaidThreeInscriptions ? (
              <Badge variant="secondary" size="sm" withDot>
                {locale === "ar" ? "معفى (مسدد في 3 أفواج)" : "Exonéré (Payé dans 3 groupes)"}
              </Badge>
            ) : inscriptionStatus.isAlreadyPaidInThisClass ? (
              <Badge variant="neutral" size="sm" withDot>
                {locale === "ar" ? "مسدد مسبقاً لهذا الفوج" : "Déjà payé pour ce groupe"}
              </Badge>
            ) : (
              <span className="text-xs font-mono font-semibold text-gray-600">
                {Number(configuredFee || classData.inscriptionFee || 0).toLocaleString()} DZD
              </span>
            )}
          </div>

          {isInscriptionChecked &&
            !inscriptionStatus.hasPaidThreeInscriptions &&
            !inscriptionStatus.isAlreadyPaidInThisClass && (
              <div className="flex items-center gap-2 ps-6 pt-1">
                <span className="text-xs text-muted">{locale === "ar" ? "المبلغ:" : "Montant :"}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inscriptionAmount}
                  onChange={(e) =>
                    setInscriptionAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="border border-border bg-surface px-2.5 py-1 text-xs rounded-lg font-mono w-32 focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
                <span className="text-xs text-muted font-bold">DZD</span>
              </div>
            )}
        </div>

        {/* ITEM 3: Books Fee (Shown for groups configured with books) */}
        {classData.hasBooks && (
          <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-gray-900 select-none">
                <input
                  type="checkbox"
                  checked={isBookChecked}
                  onChange={(e) => setIsBookChecked(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary/20 cursor-pointer"
                />
                <span>{locale === "ar" ? "رسوم الكتب المدرسية" : "Frais des manuels"}</span>
              </label>
              <span className="text-xs font-mono font-semibold text-gray-600">
                {Number(classData.bookFee || 0).toLocaleString()} DZD
              </span>
            </div>

            {isBookChecked && (
              <div className="flex items-center gap-2 ps-6 pt-1">
                <span className="text-xs text-muted">{locale === "ar" ? "المبلغ:" : "Montant :"}</span>
                <input
                  type="number"
                  step="any"
                  value={bookAmount}
                  onChange={(e) => setBookAmount(e.target.value ? Number(e.target.value) : 0)}
                  className="border border-border bg-surface px-2.5 py-1 text-xs rounded-lg font-mono w-32 focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
                <span className="text-xs text-muted font-bold">DZD</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-700">{t("notesOptional")}</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notesPlaceholderGeneral")}
          className="border border-border p-2 rounded-xl text-xs bg-surface focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>

      {/* Live Total Box */}
      <div className="p-3.5 bg-surface-subtle border border-border rounded-xl flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700">
          {locale === "ar" ? "المجموع الكلي للدفع:" : "Total à encaisser :"}
        </span>
        <span className="text-lg font-bold font-mono text-primary">
          {totalAmount.toLocaleString()} DZD
        </span>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isSubmitting || (totalAmount <= 0 && !isSiblingWaived && currentPayerStatus !== "NON_PAYER")}
        isLoading={isSubmitting}
        className="w-full"
      >
        {locale === "ar"
          ? `تأكيد وإصدار الوصل (${totalAmount.toLocaleString()} دج)`
          : `Confirmer et émettre le reçu (${totalAmount.toLocaleString()} DZD)`}
      </Button>
    </form>
  );
};

export default PaymentForm;