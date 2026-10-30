"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import {
  useActionState,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef,
  useMemo,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { getStudentSchema, StudentSchema } from "@/lib/formValidationSchemas";
import { createStudent, updateStudent, checkStudentDuplicateAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  X,
  Search,
  AlertTriangle,
  CreditCard,
  UserCheck,
  ShieldAlert,
  Fingerprint,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { splitFullName } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { DuplicateStudentCandidate } from "@/lib/studentDeduplication";
import {
  getStudentFingerprintStatusAction,
  enrollStudentFingerprintAction,
  deleteStudentFingerprintAction,
} from "@/lib/biometricActions";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
  student?: any;
};

type BridgeDevice = {
  ip: string;
  port: number;
  connected: boolean;
};

const StudentForm = ({
  type,
  data,
  setOpen,
  relatedData,
  onSuccess,
  onSwitchToExisting,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: any;
  onSuccess?: (result?: any) => void;
  onSwitchToExisting?: (student: any) => void;
}) => {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const tStudents = useTranslations("students");
  const tErrors = useTranslations("errors");

  // Localized Zod schema for real-time validation messages in active language
  const schema = useMemo(() => getStudentSchema((key) => t(key as any)), [t]);

  const splitResult = splitFullName(data?.name);
  const defaultLastName = data?.surname || splitResult.surname;
  const defaultFirstName = data?.surname ? (data?.name || "") : splitResult.name;

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch,
  } = useForm<StudentSchema>({
    resolver: zodResolver(schema),
    defaultValues: data
      ? {
          sex: data.sex || "MALE",
          gradeId: data.gradeId ? Number(data.gradeId) : undefined,
          registeredBranchId: data.registeredBranchId ? Number(data.registeredBranchId) : undefined,
          familyId: data.familyId ? Number(data.familyId) : undefined,
          ...data,
          name: defaultFirstName,
          surname: defaultLastName,
          phone: data.phone ?? "",
          address: data.address ?? "",
          classes: data.classes?.map((c: any) => (typeof c === "object" ? c.id : Number(c))) || [],
          parentPhoneNumbers: Array.isArray(data.parentPhoneNumbers)
            ? data.parentPhoneNumbers.map((p: any) => (typeof p === "string" ? p : p.phone))
            : [],
          birthday: data.birthday && !isNaN(new Date(data.birthday).getTime())
            ? new Date(data.birthday).toISOString().split("T")[0]
            : undefined,
        }
      : {
          name: "",
          surname: "",
          phone: "",
          address: "",
          sex: "MALE",
          parentPhoneNumbers: [],
          classes: [],
          birthday: undefined,
          familyId: undefined,
        },
  });

  const parentPhones = watch("parentPhoneNumbers") || [];

  const handleAddParentPhone = () => {
    setValue("parentPhoneNumbers", [...parentPhones, ""], { shouldDirty: true });
  };

  const handleParentPhoneChange = (index: number, val: string) => {
    const updated = [...parentPhones];
    updated[index] = val;
    setValue("parentPhoneNumbers", updated, { shouldDirty: true });
  };

  const handleRemoveParentPhone = (index: number) => {
    const updated = parentPhones.filter((_, idx) => idx !== index);
    setValue("parentPhoneNumbers", updated, { shouldDirty: true });
  };

  const watchedName = watch("name");
  const watchedSurname = watch("surname");
  const watchedPhone = watch("phone");
  const watchedBirthday = watch("birthday");
  const watchedGradeId = watch("gradeId");

  const submitModeRef = useRef<"create" | "create_and_pay">("create");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubmittingMode, setActiveSubmittingMode] = useState<"create" | "create_and_pay">("create");
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateStudentCandidate[]>([]);
  const [duplicateBypassed, setDuplicateBypassed] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<StudentSchema | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);

  // If identifying input fields change after a previous bypass, re-enable anti-duplicate protection
  useEffect(() => {
    if (duplicateBypassed) {
      setDuplicateBypassed(false);
    }
  }, [watchedName, watchedSurname, watchedPhone]);

  // Debounced multi-field duplicate detection (Name, Surname, Phone, Parent Phones, Birthday)
  useEffect(() => {
    if (type !== "create") return;
    const cleanFirst = watchedName ? watchedName.trim() : "";
    const cleanLast = watchedSurname ? watchedSurname.trim() : "";
    const cleanPhone = watchedPhone ? watchedPhone.trim() : "";
    const validParentPhones = (parentPhones || []).filter(Boolean);

    const hasSufficientInput =
      cleanFirst.length >= 2 ||
      cleanLast.length >= 2 ||
      cleanPhone.length >= 8 ||
      validParentPhones.some((p) => p.replace(/\D/g, "").length >= 8);

    if (!hasSufficientInput) {
      setDuplicateCandidates([]);
      return;
    }

    const timer = setTimeout(() => {
      setIsCheckingDuplicate(true);
      checkStudentDuplicateAction({
        name: cleanFirst,
        surname: cleanLast,
        phone: cleanPhone || undefined,
        parentPhoneNumbers: validParentPhones,
        birthday: watchedBirthday ? String(watchedBirthday) : undefined,
        excludeStudentId: data?.id,
      })
        .then((res) => {
          if (res.hasDuplicate) {
            setDuplicateCandidates(res.duplicates);
            setSelectedCandidateIndex(0);
          } else {
            setDuplicateCandidates([]);
          }
        })
        .catch(() => {
          setDuplicateCandidates([]);
        })
        .finally(() => {
          setIsCheckingDuplicate(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [watchedName, watchedSurname, watchedPhone, watchedBirthday, parentPhones, type, data?.id]);

  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const [classSearchTerm, setClassSearchTerm] = useState("");
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  // Biometric Fingerprint Enrollment State (§5 & §7.4 - Real ZKTeco K50 Pro Hardware)
  const [fpEnrolled, setFpEnrolled] = useState<boolean>(false);
  const [fpIsEnrolling, setFpIsEnrolling] = useState<boolean>(false);
  const [fpEnrollingStep, setFpEnrollingStep] = useState<number>(0); // 0..3 real finger taps on K50
  const [fpTargetGlobalNumber, setFpTargetGlobalNumber] = useState<number>(
    data?.globalNumber ? Number(data.globalNumber) : 0
  );
  const [fpPendingForNewStudent, setFpPendingForNewStudent] = useState<boolean>(false);
  const [fpTemplateData, setFpTemplateData] = useState<string | null>(null);
  const [fpSelectedFingerIndex, setFpSelectedFingerIndex] = useState<number>(0);
  const [fpEnrolledFingers, setFpEnrolledFingers] = useState<number[]>([]);
  const [fpPendingTemplates, setFpPendingTemplates] = useState<Record<number, string | null>>({});
  const fpTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-Device support: detect connected readers from local bridge
  const [availableDevices, setAvailableDevices] = useState<BridgeDevice[]>([]);
  const [selectedDeviceIp, setSelectedDeviceIp] = useState<string>("");

  useEffect(() => {
    fetch("http://127.0.0.1:4375/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((resData) => {
        if (resData?.devices && Array.isArray(resData.devices)) {
          const list: BridgeDevice[] = resData.devices;
          setAvailableDevices(list);
          const alive = list.filter((d) => d.connected);
          if (alive.length > 0) {
            setSelectedDeviceIp((prev) => (prev && alive.some((d) => d.ip === prev) ? prev : alive[0].ip));
          } else if (list.length > 0) {
            setSelectedDeviceIp((prev) => (prev && list.some((d) => d.ip === prev) ? prev : list[0].ip));
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (type === "update" && data?.id) {
      getStudentFingerprintStatusAction(String(data.id)).then((res) => {
        if (res.enrolled) {
          setFpEnrolled(true);
          setFpEnrolledFingers(
            Array.isArray(res.fingerprints)
              ? res.fingerprints.map((f: any) => Number(f.fingerIndex || 0))
              : [0]
          );
        }
      });
    } else if (type === "create") {
      fetch("/api/biometrics/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "next_number", globalNumber: 0 }),
      })
        .then((r) => r.json())
        .then((numData) => {
          if (numData?.globalNumber && Number(numData.globalNumber) > 0) {
            setFpTargetGlobalNumber((prev) => (prev > 0 ? prev : Number(numData.globalNumber)));
          }
        })
        .catch(() => {});
    }
    if (false && type === "update" && data?.id) {
      getStudentFingerprintStatusAction(String(data.id)).then((res) => {
        if (res.enrolled) {
          setFpEnrolled(true);
          setFpEnrolledFingers(
            Array.isArray(res.fingerprints)
              ? res.fingerprints.map((f: any) => Number(f.fingerIndex || 0))
              : [0]
          );
        }
      });
    }
    return () => {
      if (fpTimerRef.current) clearInterval(fpTimerRef.current);
    };
  }, [type, data?.id]);

  const handleStartFingerprintEnroll = async () => {
    const fullName =
      [watchedSurname, watchedName].filter(Boolean).join(" ").trim() ||
      data?.name ||
      "";

    if (!fullName) {
      toast.warning(
        locale === "ar"
          ? "يرجى إدخال اسم ولقب التلميذ أولاً ليظهر اسمه الكامل على شاشة جهاز البصمة."
          : "Veuillez d'abord saisir le nom et prénom de l'élève pour qu'ils s'affichent sur l'écran du lecteur."
      );
      return;
    }

    if (fpTimerRef.current) clearInterval(fpTimerRef.current);
    setFpIsEnrolling(true);
    setFpEnrollingStep(0);

    const currentStudentId =
      type === "update" && data?.id ? String(data.id) : null;

    try {
      // 1. Check if the School PC Local Bridge (http://127.0.0.1:4375) is running (for online cloud deployment)
      let useLocalBridge = false;
      try {
        const bridgeCheck = await fetch("http://127.0.0.1:4375/status", {
          cache: "no-store",
        });
        if (bridgeCheck.ok) {
          useLocalBridge = true;
        }
      } catch {
        useLocalBridge = false;
      }

      let startData: any = null;

      if (useLocalBridge) {
        let targetGlobalNumber = Number(
          data?.globalNumber || fpTargetGlobalNumber || 0
        );
        if (!targetGlobalNumber || targetGlobalNumber <= 0) {
          const numRes = await fetch("/api/biometrics/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "next_number",
              studentId: currentStudentId,
              globalNumber: 0,
            }),
          });
          const numData = await numRes.json();
          targetGlobalNumber = Number(numData?.globalNumber || 1);
        }
        if (false) {
        // Resolve the student's globalNumber from the cloud database first
        const numRes = await fetch("/api/biometrics/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "next_number",
            studentId: currentStudentId,
            globalNumber: data?.globalNumber ? Number(data.globalNumber) : 0,
          }),
        });
        const numData = await numRes.json();
        const _unusedTargetGlobalNumber = 0;
        }
        if (false) Number(0
        );

        // Start 3-tap hardware enrollment on the School PC's targeted K50 Pro via 127.0.0.1:4375
        const bridgeStartRes = await fetch("http://127.0.0.1:4375/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: currentStudentId,
            globalNumber: targetGlobalNumber,
            studentName: fullName,
            fingerIndex: fpSelectedFingerIndex,
            deviceIp: selectedDeviceIp || undefined,
          }),
        });
        startData = await bridgeStartRes.json();
        startData.globalNumber = targetGlobalNumber;
      } else {
        // Direct Next.js server -> K50 Pro enrollment (local network server mode)
        const startRes = await fetch("/api/biometrics/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: currentStudentId,
            globalNumber: data?.globalNumber ? Number(data.globalNumber) : 0,
            studentName: fullName,
            fingerIndex: fpSelectedFingerIndex,
          }),
        });
        startData = await startRes.json();
      }

      if (!startData?.success) {
        setFpIsEnrolling(false);
        setFpEnrollingStep(0);
        toast.error(
          startData?.message ||
            (locale === "ar"
              ? "تعذر الاتصال بجهاز البصمة K50 Pro (192.168.50.201)."
              : "Impossible de joindre le lecteur K50 Pro (192.168.50.201).")
        );
        return;
      }

      if (startData.globalNumber) {
        setFpTargetGlobalNumber(Number(startData.globalNumber));
      }

      const pollUrl = useLocalBridge
        ? "http://127.0.0.1:4375/enroll"
        : "/api/biometrics/enroll";

      // Poll live 3-tap progress from the physical K50 Pro every 500ms
      fpTimerRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(pollUrl, {
            cache: "no-store",
          });
          const pollData = await pollRes.json();
          const enroll = pollData?.enrollment;
          if (!enroll) return;

          if (typeof enroll.step === "number") {
            setFpEnrollingStep(enroll.step);
          }

          if (enroll.status === "SUCCESS") {
            if (fpTimerRef.current) clearInterval(fpTimerRef.current);
            setFpIsEnrolling(false);
            setFpEnrollingStep(0);
            setFpEnrolled(true);
            setFpEnrolledFingers((prev) =>
              prev.includes(fpSelectedFingerIndex) ? prev : [...prev, fpSelectedFingerIndex]
            );

            if (enroll.templateData) {
              setFpTemplateData(enroll.templateData);
              setFpPendingTemplates((prev) => ({
                ...prev,
                [fpSelectedFingerIndex]: enroll.templateData,
              }));
            }

            // If using the School PC Local Bridge for an existing student, save the fingerprint record in the Cloud DB
            if (useLocalBridge && currentStudentId && enroll.globalNumber > 0) {
              await fetch("/api/biometrics/enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mode: "save_db",
                  studentId: currentStudentId,
                  globalNumber: Number(enroll.globalNumber),
                  fingerIndex: fpSelectedFingerIndex,
                  templateData: enroll.templateData || undefined,
                }),
              }).catch(() => {});
            }

            if (type === "create") {
              setFpPendingForNewStudent(true);
              toast.success(
                locale === "ar"
                  ? `تم تسجيل البصمة بنجاح على جهاز K50 Pro (رقم #${enroll.globalNumber})! سيتم ربطها فور حفظ التلميذ.`
                  : `Empreinte enregistrée sur le K50 Pro (ID #${enroll.globalNumber}) ! Elle sera liée dès la sauvegarde.`
              );
            } else {
              toast.success(
                locale === "ar"
                  ? `تم تسجيل البصمة بنجاح على جهاز K50 Pro (رقم #${enroll.globalNumber})!`
                  : `Empreinte enregistrée avec succès sur le K50 Pro (ID #${enroll.globalNumber}) !`
              );
            }
          } else if (enroll.status === "FAILED") {
            if (fpTimerRef.current) clearInterval(fpTimerRef.current);
            setFpIsEnrolling(false);
            setFpEnrollingStep(0);
            toast.error(
              locale === "ar"
                ? "فشل تسجيل البصمة على جهاز K50 Pro (الأصبع مستعمل مسبقاً أو لم يوضع بشكل صحيح). يرجى المحاولة مجدداً."
                : enroll.message ||
                    "Échec de lecture sur le K50 Pro. Veuillez réessayer."
            );
          } else if (enroll.status === "CANCELLED") {
            if (fpTimerRef.current) clearInterval(fpTimerRef.current);
            setFpIsEnrolling(false);
            setFpEnrollingStep(0);
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 500);
    } catch {
      setFpIsEnrolling(false);
      setFpEnrollingStep(0);
      toast.error(
        locale === "ar"
          ? "حدث خطأ أثناء الاتصال بجهاز K50 Pro."
          : "Erreur de communication avec le lecteur K50 Pro."
      );
    }
  };

  const handleCancelFingerprintEnroll = async () => {
    if (fpTimerRef.current) clearInterval(fpTimerRef.current);
    setFpIsEnrolling(false);
    setFpEnrollingStep(0);
    await fetch("http://127.0.0.1:4375/enroll?mode=cancel", {
      method: "DELETE",
    }).catch(() => {});
    await fetch("/api/biometrics/enroll?mode=cancel", { method: "DELETE" }).catch(
      () => {}
    );
  };

  const handleDeleteFingerprint = async () => {
    const targetNum = data?.globalNumber || fpTargetGlobalNumber || 0;
    const studentIdParam =
      type === "update" && data?.id ? `&studentId=${encodeURIComponent(String(data.id))}` : "";
    await fetch(
      `http://127.0.0.1:4375/enroll?mode=delete&globalNumber=${targetNum}`,
      { method: "DELETE" }
    ).catch(() => {});
    const res = await fetch(
      `/api/biometrics/enroll?mode=delete&globalNumber=${targetNum}${studentIdParam}`,
      { method: "DELETE" }
    ).then((r) => r.json()).catch(() => ({ success: false }));

    if (res.success) {
      setFpEnrolled(false);
      setFpPendingForNewStudent(false);
      setFpEnrolledFingers([]);
      setFpPendingTemplates({});
      toast.success(
        res.message ||
          (locale === "ar"
            ? "تم حذف البصمة من الجهاز والنظام."
            : "Empreinte supprimée du lecteur K50 Pro et du système.")
      );
    } else {
      toast.error(
        res.message ||
          (locale === "ar"
            ? "تعذر حذف البصمة."
            : "Erreur lors de la suppression de l'empreinte.")
      );
    }
  };

  const executeStudentSubmit = async (
    formData: StudentSchema,
    mode: "create" | "create_and_pay"
  ) => {
    setIsSubmitting(true);
    setActiveSubmittingMode(mode);
    try {
      const initialState = { success: false, error: false, message: "" };
      const res = await (type === "create"
        ? createStudent(initialState, {
            ...formData,
            reservedGlobalNumber:
              fpPendingForNewStudent && fpTargetGlobalNumber > 0
                ? fpTargetGlobalNumber
                : undefined,
          })
        : updateStudent(initialState, formData));

      if (res.success) {
        // If fingerprint was captured during student creation, persist it immediately!
        const createdStudent = (res as any).student;
        if (
          type === "create" &&
          fpPendingForNewStudent &&
          createdStudent?.id &&
          createdStudent?.globalNumber
        ) {
          await enrollStudentFingerprintAction({
            studentId: String(createdStudent.id),
            globalNumber: Number(createdStudent.globalNumber),
            fingerIndex: fpSelectedFingerIndex,
            templateData:
              fpPendingTemplates[fpSelectedFingerIndex] || fpTemplateData || undefined,
          });
          for (const fIdx of fpEnrolledFingers) {
            if (fIdx !== fpSelectedFingerIndex) {
              await enrollStudentFingerprintAction({
                studentId: String(createdStudent.id),
                globalNumber: Number(createdStudent.globalNumber),
                fingerIndex: fIdx,
                templateData: fpPendingTemplates[fIdx] || undefined,
              });
            }
          }
          if (false) await enrollStudentFingerprintAction({ studentId: "", globalNumber: 0,
          });
        }

        toast.success(
          res.message ||
            (type === "create"
              ? tStudents("createdSuccess")
              : tStudents("updatedSuccess"))
        );
        const andPay = mode === "create_and_pay";
        const selectedClassId = formData.classes && formData.classes.length > 0 ? Number(formData.classes[0]) : null;
        const targetClass = selectedClassId ? classes.find((c: any) => Number(c.id) === selectedClassId) : null;

        if (andPay && !selectedClassId) {
          toast.warning(
            locale === "ar"
              ? "تنبيه: يجب اختيار فوج دراسي لفتح نافذة الدفع مباشرة"
              : "Veuillez sélectionner au moins un groupe pour ouvrir le paiement direct"
          );
        }

        if (onSuccess) {
          onSuccess({
            ...res,
            andPay: andPay && Boolean(targetClass),
            student: (res as any).student,
            classData: targetClass,
          });
        } else {
          setOpen(false);
          startTransition(() => {
            router.refresh();
          });
        }
      } else {
        toast.error(res.message || tErrors("general"));
      }
    } catch (err: any) {
      toast.error(err?.message || tErrors("general"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (formData: StudentSchema) => {
    const mode = submitModeRef.current;
    if (type === "create" && !duplicateBypassed) {
      if (duplicateCandidates.length > 0) {
        setPendingFormData(formData);
        setShowDuplicateModal(true);
        return;
      }

      // Synchronous safety check in case the user submitted immediately before debounce completed
      const cleanFirst = formData.name ? formData.name.trim() : "";
      const cleanLast = formData.surname ? formData.surname.trim() : "";
      const cleanPhone = formData.phone ? formData.phone.trim() : "";
      const validParentPhones = (formData.parentPhoneNumbers || []).filter(Boolean);

      const hasSufficientInput =
        cleanFirst.length >= 2 ||
        cleanLast.length >= 2 ||
        cleanPhone.length >= 8 ||
        validParentPhones.some((p) => p.replace(/\D/g, "").length >= 8);

      if (hasSufficientInput) {
        setIsCheckingDuplicate(true);
        try {
          const res = await checkStudentDuplicateAction({
            name: cleanFirst,
            surname: cleanLast,
            phone: cleanPhone || undefined,
            parentPhoneNumbers: validParentPhones,
            birthday: formData.birthday ? String(formData.birthday) : undefined,
            excludeStudentId: data?.id,
          });

          if (res.hasDuplicate && res.duplicates.length > 0) {
            setDuplicateCandidates(res.duplicates);
            setSelectedCandidateIndex(0);
            setPendingFormData(formData);
            setShowDuplicateModal(true);
            return;
          }
        } catch {
          // If check fails, allow normal submission
        } finally {
          setIsCheckingDuplicate(false);
        }
      }
    }

    executeStudentSubmit({ ...formData, bypassDuplicateCheck: duplicateBypassed }, mode);
  };

  const handleConfirmDuplicateBypass = () => {
    setDuplicateBypassed(true);
    setShowDuplicateModal(false);
    if (pendingFormData) {
      executeStudentSubmit(
        { ...pendingFormData, bypassDuplicateCheck: true },
        submitModeRef.current
      );
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        classesDropdownRef.current &&
        !classesDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClassesOpen(false);
        setClassSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { grades = [], classes = [], families = [] } = relatedData || {};

  const filteredClasses = useMemo(() => {
    let list = classes;
    if (watchedGradeId) {
      list = list.filter(
        (c: any) => !c.levelId || Number(c.levelId) === Number(watchedGradeId)
      );
    }
    if (!classSearchTerm.trim()) return list;
    const term = classSearchTerm.toLowerCase().trim();
    return list.filter((c: any) => c.name.toLowerCase().includes(term));
  }, [classes, watchedGradeId, classSearchTerm]);

  const renderMatchBadge = (cand: DuplicateStudentCandidate) => {
    const reasonText = locale === "ar" ? cand.matchReasonAr : cand.matchReasonFr;
    if (cand.matchType === "NAME_AND_BIRTHDAY" || cand.matchType === "EXACT_NAME") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
          <ShieldAlert className="w-3 h-3 text-red-600" />
          {reasonText}
        </span>
      );
    }
    if (cand.matchType === "PHONE_MATCH" || cand.matchType === "PARENT_PHONE_MATCH") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          <AlertTriangle className="w-3 h-3 text-blue-600" />
          {reasonText}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        {reasonText}
      </span>
    );
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(handleFormSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      {data?.registeredBranchId && (
        <input
          type="hidden"
          {...register("registeredBranchId")}
          defaultValue={data.registeredBranchId}
        />
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-section-title font-bold text-start text-gray-900">
          {type === "create"
            ? data?.targetClassName
              ? (locale === "ar"
                  ? `تسجيل تلميذ في فوج ${data.targetClassName}`
                  : `Inscrire un élève dans ${data.targetClassName}`)
              : tStudents("createTitle")
            : tStudents("updateTitle")}
        </h1>
        {data?.targetClassName && (
          <p className="text-xs text-muted">
            {locale === "ar"
              ? `سيتم تسجيل التلميذ وإضافته مباشرة إلى هذا الفوج`
              : `L'élève sera inscrit et ajouté directement à ce groupe`}
          </p>
        )}
      </div>

      {/* PERSONAL INFO SECTION */}
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
        {tStudents("personalInfo")}
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label={tStudents("surname")}
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label={tStudents("name")}
          name="name"
          register={register}
          error={errors.name}
        />

        {/* Live Duplicate Warning Banner */}
        {duplicateCandidates.length > 0 && !duplicateBypassed && (
          <div className="w-full p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2.5 text-xs text-amber-950 shadow-2xs animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-200/80 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <ShieldAlert className="w-4 h-4 text-amber-800" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sm text-gray-900">
                      {locale === "ar"
                        ? duplicateCandidates.length === 1
                          ? "تنبيه: تم العثور على تلميذ مسجل بمعلومات مماثلة"
                          : `تنبيه: تم العثور على ${duplicateCandidates.length} تلاميذ بمعلومات مماثلة`
                        : duplicateCandidates.length === 1
                        ? "Attention : Un élève similaire a été détecté"
                        : `Attention : ${duplicateCandidates.length} élèves similaires détectés`}
                    </p>
                    {renderMatchBadge(duplicateCandidates[0])}
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    <span className="font-semibold">
                      #{duplicateCandidates[0].globalNumber} {duplicateCandidates[0].name}
                    </span>
                    {" • "}
                    <span>{duplicateCandidates[0].branchName}</span>
                    {duplicateCandidates[0].phone && (
                      <span> • {duplicateCandidates[0].phone}</span>
                    )}
                    {duplicateCandidates[0].birthday && (
                      <span> • {duplicateCandidates[0].birthday}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDuplicateModal(true)}
                  className="bg-white hover:bg-amber-100 border-amber-300 text-amber-900 font-semibold"
                >
                  {locale === "ar" ? "مقارنة البيانات" : "Comparer"}
                </Button>
                {onSwitchToExisting && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => onSwitchToExisting(duplicateCandidates[0])}
                    className="bg-amber-700 hover:bg-amber-800 text-white font-bold"
                  >
                    {locale === "ar" ? "تسجيل هذا التلميذ" : "Inscrire cet élève"}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setDuplicateBypassed(true)}
                  title={locale === "ar" ? "تجاهل التنبيه" : "Ignorer l'alerte"}
                  className="p-1 text-amber-700 hover:text-amber-950 rounded hover:bg-amber-200/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <InputField
          label={tStudents("phone")}
          name="phone"
          register={register}
          error={errors.phone}
        />
        <InputField
          label={tStudents("address")}
          name="address"
          register={register}
          error={errors.address}
        />
        <InputField
          label={tStudents("birthday")}
          name="birthday"
          register={register}
          error={errors.birthday}
          type="date"
        />

        {/* GENDER SELECT */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tStudents("sex")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("sex")}
          >
            <option value="MALE">{tStudents("male")}</option>
            <option value="FEMALE">{tStudents("female")}</option>
          </select>
          {errors.sex?.message && (
            <p className="text-xs text-red-400">
              {errors.sex.message.toString()}
            </p>
          )}
        </div>

        {/* GRADE SELECT WITH REVERSE FILTERING */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tStudents("grade")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("gradeId", {
              onChange: (e) => {
                const newGradeId = e.target.value ? Number(e.target.value) : undefined;
                if (newGradeId) {
                  const currentClasses = watch("classes") || [];
                  const validClasses = currentClasses.filter((cid: number) => {
                    const cls = classes.find((c: any) => c.id === cid);
                    return !cls || !cls.levelId || Number(cls.levelId) === Number(newGradeId);
                  });
                  if (validClasses.length !== currentClasses.length) {
                    setValue("classes", validClasses);
                  }
                }
              },
            })}
          >
            <option value="">{tStudents("selectGrade")}</option>
            {grades.map((grade: { id: number; level?: string; name?: string }) => (
              <option value={grade.id} key={grade.id}>
                {grade.level || grade.name}
              </option>
            ))}
          </select>
          {errors.gradeId?.message && (
            <p className="text-xs text-red-400">
              {errors.gradeId.message.toString()}
            </p>
          )}
        </div>

        {/* CLASSES MULTI-SELECT DROPDOWN */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={classesDropdownRef}
        >
          <label className="text-xs text-gray-500">{tStudents("classes")}</label>
          <Controller
            name="classes"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value)
                ? field.value
                : [];
              const selectedClassObjects = classes.filter((c: any) =>
                safeFieldValue.includes(c.id)
              );
              const getDisplayText = () => {
                if (selectedClassObjects.length === 0)
                  return tStudents("selectClass");
                if (selectedClassObjects.length <= 2)
                  return selectedClassObjects.map((c: any) => c.name).join(", ");
                const firstTwoNames = selectedClassObjects
                  .slice(0, 2)
                  .map((c: any) => c.name)
                  .join(", ");
                return `${firstTwoNames}, ${tStudents("andMore", {
                  count: (selectedClassObjects.length - 2).toString(),
                })}`;
              };

              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-md text-sm w-full h-[42px] flex items-center justify-between bg-white cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => setIsClassesOpen((prev) => !prev)}
                  >
                    <span
                      className={`truncate text-start flex-1 min-w-0 me-2 ${
                        safeFieldValue.length > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }`}
                    >
                      {getDisplayText()}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${
                        isClassesOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isClassesOpen && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-20 flex flex-col max-h-60 overflow-hidden">
                      {watchedGradeId && (
                        <div className="px-2.5 py-1.5 bg-blue-50 text-blue-800 text-[11px] font-semibold border-b border-blue-100 flex items-center justify-between">
                          <span>
                            {locale === "ar"
                              ? `أفواج المستوى المحدد (${filteredClasses.length})`
                              : `Groupes de ce niveau (${filteredClasses.length})`}
                          </span>
                        </div>
                      )}
                      {/* Search bar for classes */}
                      <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-10">
                        <div className="relative flex items-center">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute start-2 pointer-events-none" />
                          <input
                            type="text"
                            placeholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
                            className="w-full ps-7 pe-7 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                            value={classSearchTerm}
                            onChange={(e) => setClassSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          {classSearchTerm && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClassSearchTerm("");
                              }}
                              className="absolute end-1.5 text-gray-400 hover:text-gray-600 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-y-auto max-h-48 divide-y divide-gray-100">
                        {filteredClasses.length > 0 ? (
                          filteredClasses.map((classItem: { id: number; name: string; levelId?: number }) => (
                            <label
                              key={classItem.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer text-xs"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={safeFieldValue.includes(classItem.id)}
                                onChange={(e) => {
                                  const selectedId = classItem.id;
                                  if (e.target.checked) {
                                    field.onChange([...safeFieldValue, selectedId]);
                                    if (classItem.levelId) {
                                      setValue("gradeId", Number(classItem.levelId), { shouldValidate: true });
                                    }
                                  } else {
                                    field.onChange(
                                      safeFieldValue.filter((id: number) => id !== selectedId)
                                    );
                                  }
                                }}
                              />
                              <span className="text-gray-700 font-medium">
                                {classItem.name}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className="p-3 text-center text-xs text-gray-400">
                            {locale === "ar" ? "لم يتم العثور على أي فوج" : "Aucun groupe trouvé"}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.classes?.message && (
            <p className="text-xs text-red-400">
              {errors.classes.message.toString()}
            </p>
          )}
        </div>

        {/* FAMILY (SIBLING DISCOUNT GROUP) SELECT */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 font-medium">
            {locale === "ar" ? "العائلة / خصم الإخوة (اختياري)" : "Famille / Remise fratrie (Optionnel)"}
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("familyId")}
          >
            <option value="">
              {locale === "ar" ? "-- بدون عائلة (سعر عادي 100%) --" : "-- Aucune famille (Plein tarif) --"}
            </option>
            {families.map((fam: any) => (
              <option value={fam.id} key={fam.id}>
                {fam.name} {fam.studentNames ? `(${fam.studentNames})` : ""} - {fam.discountPercentage}%
              </option>
            ))}
          </select>
          {errors.familyId?.message && (
            <p className="text-xs text-red-400">
              {errors.familyId.message.toString()}
            </p>
          )}
        </div>
      </div>

      {/* PARENT PHONE NUMBERS SECTION (§7.2) */}
      <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            {tStudents("parentPhoneNumbers")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddParentPhone}
            className="text-xs flex items-center gap-1"
          >
            + {tStudents("addParentPhoneNumber")}
          </Button>
        </div>
        {parentPhones.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {tStudents("noParentPhonesAdded")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {parentPhones.map((phoneVal, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="tel"
                  value={phoneVal}
                  placeholder={tStudents("parentPhonePlaceholder")}
                  onChange={(e) => handleParentPhoneChange(index, e.target.value)}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm flex-1 h-[42px] bg-white text-gray-700 font-mono"
                  dir="ltr"
                />
                <Button
                  type="button"
                  variant="danger"
                  size="icon-sm"
                  onClick={() => handleRemoveParentPhone(index)}
                  title={tStudents("remove")}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* §7.4 Biometric Fingerprint Enrollment Card (ZKTeco K50/ID PRO) */}
      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2.5">
        {/* Multi-Device Selector if more than 1 device is detected */}
        {availableDevices.length > 1 && !fpIsEnrolling && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white rounded-md border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-700">
                {locale === "ar" ? "جهاز التسجيل المختار:" : "Lecteur d'enrôlement :"}
              </span>
              <select
                value={selectedDeviceIp}
                onChange={(e) => setSelectedDeviceIp(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-300 rounded px-2 py-1 text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {availableDevices.map((d, idx) => (
                  <option key={d.ip} value={d.ip}>
                    {locale === "ar"
                      ? `جهاز ${idx + 1} (${d.ip})`
                      : `Lecteur ${idx + 1} (${d.ip})`}
                    {d.connected ? "" : " (Hors-ligne)"}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {locale === "ar"
                ? "الأجهزة الأخرى ستواصل تسجيل الحضور تلقائياً"
                : "Les autres lecteurs continuent la prise de présence"}
            </span>
          </div>
        )}

        {/* Finger Selector: Primary Finger (0) + Backup Finger (1) */}
        {!fpIsEnrolling && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <span className="text-[11px] font-medium text-gray-600">
              {locale === "ar" ? "الأصبع المختار للتسجيل:" : "Doigt à enregistrer :"}
            </span>
            <div className="inline-flex items-center gap-1.5">
              {[
                {
                  idx: 0,
                  labelFr: "Doigt 1 (Principal)",
                  labelAr: "الأصبع 1 (الرئيسي)",
                },
                {
                  idx: 1,
                  labelFr: "Doigt 2 (Secours)",
                  labelAr: "الأصبع 2 (احتياطي)",
                },
              ].map((fg) => {
                const isThisFingerEnrolled = fpEnrolledFingers.includes(fg.idx);
                const isSelected = fpSelectedFingerIndex === fg.idx;
                return (
                  <button
                    key={fg.idx}
                    type="button"
                    onClick={() => setFpSelectedFingerIndex(fg.idx)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 border cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span>{locale === "ar" ? fg.labelAr : fg.labelFr}</span>
                    {isThisFingerEnrolled && (
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {fpIsEnrolling ? (
          /* State B: Waiting for 3 real finger taps on K50 Pro */
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs">
                <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-35 animate-ping" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-blue-600" />
                </span>
                <span>
                  {locale === "ar"
                    ? `جاري تسجيل البصمة على الجهاز ${selectedDeviceIp ? `(${selectedDeviceIp})` : ""}${
                        fpTargetGlobalNumber || data?.globalNumber
                          ? ` (رقم #${fpTargetGlobalNumber || data?.globalNumber})`
                          : ""
                      }...`
                    : `Enregistrement sur le lecteur ${selectedDeviceIp ? `(${selectedDeviceIp})` : ""}${
                        fpTargetGlobalNumber || data?.globalNumber
                          ? ` (ID #${fpTargetGlobalNumber || data?.globalNumber})`
                          : ""
                      }...`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelFingerprintEnroll}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded hover:bg-gray-200 cursor-pointer transition-colors"
              >
                {locale === "ar" ? "إلغاء" : "Annuler"}
              </button>
            </div>
            <p className="text-xs text-gray-600">
              {locale === "ar"
                ? "اطلب من التلميذ وضع إصبعه 3 مرات على قارئ البصمة K50 Pro"
                : "Demandez à l'étudiant de poser son doigt 3 fois sur le lecteur K50 Pro"}
            </p>
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3].map((stepIdx) => (
                <span
                  key={stepIdx}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-all ${
                    fpEnrollingStep >= stepIdx
                      ? "bg-blue-600 text-white shadow-xs scale-105"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {stepIdx}
                </span>
              ))}
              <span className="text-xs font-medium text-blue-700 ms-1">
                {locale === "ar"
                  ? `(${fpEnrollingStep}/3 قراءات مكتملة...)`
                  : `(${fpEnrollingStep}/3 lectures validées...)`}
              </span>
            </div>
          </div>
        ) : fpEnrolled ? (
          /* State C: Enrolled & Synced Across All Branches */
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-gray-900">
                  {locale === "ar"
                    ? "البصمة البيومترية (ZKTeco K50)"
                    : "Empreinte Biométrique (ZKTeco K50)"}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium">
                  <span className="relative inline-flex items-center justify-center w-2 h-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-35 animate-ping" />
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-600" />
                  </span>
                  {locale === "ar"
                    ? "مسجلة ومزامنة"
                    : "Enregistrée & Synchro"}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                {data?.globalNumber
                  ? locale === "ar"
                    ? `رقم الجهاز: #${data.globalNumber} • صالحة في جميع الفروع`
                    : `ID Appareil : #${data.globalNumber} • Synchronisée sur tous les sièges`
                  : locale === "ar"
                  ? "سيتم ربطها برقم التلميذ ومزامنتها في جميع الفروع تلقائياً"
                  : "Sera associée à l'ID global et synchronisée sur tous les sièges"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleStartFingerprintEnroll}
                className="px-3 py-1.5 rounded-md bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {locale === "ar" ? "تحديث البصمة" : "Mettre à jour l'empreinte"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDeleteFingerprint}
                className="p-1.5 rounded-md bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-red-600 cursor-pointer transition-colors"
                title={locale === "ar" ? "حذف البصمة" : "Supprimer l'empreinte"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* State A: Not Yet Enrolled */
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-800">
                  {locale === "ar"
                    ? "البصمة البيومترية (ZKTeco K50)"
                    : "Empreinte Biométrique (ZKTeco K50)"}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[11px] font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                  {locale === "ar" ? "غير مسجلة" : "Non enregistrée"}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                {locale === "ar"
                  ? "سجل البصمة مرة واحدة فقط لتعمل تلقائياً في جميع الفروع."
                  : "Enregistrez l'empreinte une seule fois pour tous les sièges."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartFingerprintEnroll}
              className="px-3.5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors shrink-0"
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {locale === "ar"
                  ? "تسجيل البصمة على الجهاز"
                  : "Enregistrer l'empreinte"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Dual action buttons or update button */}
      {type === "create" ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-2">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={isSubmitting}
            isLoading={isSubmitting && activeSubmittingMode === "create"}
            className="w-full sm:flex-1"
            onClick={() => {
              submitModeRef.current = "create";
            }}
          >
            {isSubmitting && activeSubmittingMode === "create"
              ? tStudents("submittingCreate")
              : tCommon("create")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            isLoading={isSubmitting && activeSubmittingMode === "create_and_pay"}
            className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
            onClick={() => {
              submitModeRef.current = "create_and_pay";
            }}
            leftIcon={<CreditCard className="w-4 h-4" />}
          >
            {isSubmitting && activeSubmittingMode === "create_and_pay"
              ? tStudents("submittingCreate")
              : locale === "ar"
              ? "تسجيل ودفع وصل"
              : "Inscrire et Payer"}
          </Button>
        </div>
      ) : (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          className="w-full mt-2"
          onClick={() => {
            submitModeRef.current = "create";
          }}
        >
          {isSubmitting ? tStudents("submittingUpdate") : tCommon("edit")}
        </Button>
      )}

      {/* Duplicate Confirmation Modal */}
      {showDuplicateModal && duplicateCandidates.length > 0 && (() => {
        const activeCand = duplicateCandidates[selectedCandidateIndex] || duplicateCandidates[0];
        const inputFullName = [watchedSurname, watchedName].filter(Boolean).join(" ").trim() || "-";
        const inputBirthdayStr = watchedBirthday
          ? new Date(watchedBirthday).toISOString().split("T")[0]
          : null;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 font-sans">
            <div className="bg-surface rounded-xl border border-border shadow-2xl p-5 sm:p-6 max-w-xl w-full space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-gray-900">
                      {locale === "ar"
                        ? "تنبيه: تم العثور على ملف تلميذ مماثل"
                        : "Attention : Fiche élève similaire détectée"}
                    </h3>
                    <p className="text-xs text-muted">
                      {locale === "ar"
                        ? "يرجى مراجعة البيانات للمقارنة قبل المتابعة لتفادي التكرار"
                        : "Veuillez comparer les données pour éviter les doublons."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Multiple candidates navigation tabs */}
              {duplicateCandidates.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border">
                  <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                    {locale === "ar" ? "التطابقات:" : "Candidats:"}
                  </span>
                  {duplicateCandidates.map((cand, idx) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setSelectedCandidateIndex(idx)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                        idx === selectedCandidateIndex
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "bg-surface-subtle text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      #{cand.globalNumber} {cand.name} ({cand.similarityScore}%)
                    </button>
                  ))}
                </div>
              )}

              {/* Match Reason Banner */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-950">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">
                      {locale === "ar" ? activeCand.matchReasonAr : activeCand.matchReasonFr}
                    </span>
                    <span className="text-amber-800 text-[11px] ms-1">
                      ({locale === "ar" ? `نسبة التطابق: ${activeCand.similarityScore}%` : `Similarité : ${activeCand.similarityScore}%`})
                    </span>
                  </div>
                </div>
                <a
                  href={`/list/students/${activeCand.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline shrink-0"
                >
                  <span>{locale === "ar" ? "فتح الملف" : "Ouvrir la fiche"}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Side-by-side comparison table */}
              <div className="border border-border rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-3 bg-surface-subtle font-bold p-2.5 text-gray-700 border-b border-border">
                  <span>{locale === "ar" ? "المعلومة" : "Champ"}</span>
                  <span>{locale === "ar" ? "المعلومة المدخلة" : "Saisie actuelle"}</span>
                  <span>{locale === "ar" ? `الملف المسجل (#${activeCand.globalNumber})` : `Élève existant (#${activeCand.globalNumber})`}</span>
                </div>

                {/* Name row */}
                <div className="grid grid-cols-3 p-2.5 border-b border-border items-center">
                  <span className="font-semibold text-gray-500">
                    {locale === "ar" ? "الاسم واللقب" : "Nom & Prénom"}
                  </span>
                  <span className="font-medium text-gray-900">{inputFullName}</span>
                  <div className="flex items-center gap-1.5 font-medium text-gray-900">
                    <span>{activeCand.name}</span>
                    {activeCand.isExactName && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                  </div>
                </div>

                {/* Birthday row */}
                <div className={`grid grid-cols-3 p-2.5 border-b border-border items-center ${
                  activeCand.hasDifferentBirthday ? "bg-amber-50/50" : activeCand.isSameBirthday ? "bg-red-50/50" : ""
                }`}>
                  <span className="font-semibold text-gray-500">
                    {locale === "ar" ? "تاريخ الميلاد" : "Date de naissance"}
                  </span>
                  <span className="text-gray-800">{inputBirthdayStr || (locale === "ar" ? "غير محدد" : "Non renseigné")}</span>
                  <div className="flex items-center gap-1.5 text-gray-800">
                    <span>{activeCand.birthday || (locale === "ar" ? "غير محدد" : "Non renseigné")}</span>
                    {activeCand.isSameBirthday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                        {locale === "ar" ? "متطابق" : "Identique"}
                      </span>
                    )}
                    {activeCand.hasDifferentBirthday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                        {locale === "ar" ? "مختلف" : "Différente"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone row */}
                <div className="grid grid-cols-3 p-2.5 border-b border-border items-center">
                  <span className="font-semibold text-gray-500">
                    {locale === "ar" ? "رقم الهاتف" : "Téléphone"}
                  </span>
                  <span className="font-mono text-gray-800" dir="ltr">
                    {watchedPhone || (locale === "ar" ? "غير محدد" : "Non renseigné")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-800" dir="ltr">
                      {activeCand.phone || (locale === "ar" ? "غير محدد" : "Non renseigné")}
                    </span>
                    {activeCand.isSamePhone && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        {locale === "ar" ? "متطابق" : "Identique"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Branch row */}
                <div className="grid grid-cols-3 p-2.5 border-b border-border items-center">
                  <span className="font-semibold text-gray-500">
                    {locale === "ar" ? "الفرع" : "Siège"}
                  </span>
                  <span className="text-gray-500 italic">
                    {locale === "ar" ? "الفرع الحالي" : "Siège actuel"}
                  </span>
                  <span className="font-medium text-gray-800">{activeCand.branchName}</span>
                </div>

                {/* Classes row */}
                <div className="grid grid-cols-3 p-2.5 items-center">
                  <span className="font-semibold text-gray-500">
                    {locale === "ar" ? "الأفواج المسجل بها" : "Groupes existants"}
                  </span>
                  <span className="text-gray-500 italic">
                    {locale === "ar" ? "قيد التسجيل" : "En cours de saisie"}
                  </span>
                  <span className="text-gray-800">
                    {activeCand.classes.length > 0
                      ? activeCand.classes.join(", ")
                      : (locale === "ar" ? "لا يوجد أفواج حالية" : "Aucun groupe")}
                  </span>
                </div>
              </div>

              {/* Smart Contextual Guidance */}
              {activeCand.hasDifferentBirthday ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                  <span className="text-base shrink-0">💡</span>
                  <p>
                    {locale === "ar"
                      ? "تواريخ الميلاد مختلفة. يُرجح أنهما تلميذان مختلفان يحملان نفس الاسم (حالة تشابه أسماء). يمكنك تأكيد الإنشاء للمتابعة دون قلق."
                      : "Les dates de naissance sont différentes. Il s'agit très probablement d'un homonyme (deux personnes distinctes). Vous pouvez confirmer la création sereinement."}
                  </p>
                </div>
              ) : activeCand.isSameBirthday || activeCand.isSamePhone ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <p>
                    {locale === "ar"
                      ? "تنبيه: تاريخ الميلاد أو رقم الهاتف متطابقان تماماً. يُرجى التحقق للتأكد من عدم تسجيل نفس التلميذ مرتين تفادياً للأخطاء في الحسابات والأفواج."
                      : "Attention : La date de naissance ou le numéro de téléphone correspondent exactement. Vérifiez s'il ne s'agit pas du même élève pour éviter les doublons dans les paiements et présences."}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {locale === "ar"
                    ? "هل ترغب في اعتماد هذا التلميذ المسجل مسبقاً، أو تأكيد إنشاء تلميذ جديد تماماً يحمل نفس الاسم (حالة تشابه أسماء)؟"
                    : "Souhaitez-vous inscrire cet élève existant, ou confirmer la création d'un nouvel élève (homonyme) ?"}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDuplicateModal(false)}
                  className="w-full sm:w-auto"
                >
                  {locale === "ar" ? "تعديل البيانات" : "Vérifier la saisie"}
                </Button>
                {onSwitchToExisting && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setShowDuplicateModal(false);
                      onSwitchToExisting(activeCand);
                    }}
                    className="w-full sm:w-auto bg-primary text-white font-bold"
                  >
                    {locale === "ar" ? "تسجيل التلميذ الموجود" : "Inscrire l'élève existant"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleConfirmDuplicateBypass}
                  className="w-full sm:w-auto text-amber-900 hover:bg-amber-100 font-semibold"
                >
                  {locale === "ar" ? "تأكيد وإنشاء تلميذ جديد" : "Créer quand même (Homonyme)"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </form>
  );
};

export default StudentForm;
