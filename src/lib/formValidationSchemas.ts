import { z } from "zod";

export const subjectSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم المادة مطلوب!" }),
  teachers: z.array(z.string()), //teacher ids
});

export type SubjectSchema = z.infer<typeof subjectSchema>;

export const classSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم الفوج مطلوب!" }),
  gradeId: z.coerce.number().min(1, { message: "المستوى مطلوب!" }),
  supervisorId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
  price: z.coerce.number().min(0, { message: "لا يمكن أن يكون السعر سالبًا." }), // ADDED: Price for 4 sessions
});

export type ClassSchema = z.infer<typeof classSchema>;

export const teacherSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  subjects: z.array(z.number()).optional(),
});

export type TeacherSchema = z.infer<typeof teacherSchema>;

export const bookDropSchema = z.object({
  teacherId: z.string().min(1, { message: "الأستاذ مطلوب" }),
  bookId: z.coerce.number().optional(),
  newBookTitle: z.string().optional(),
  levelId: z.coerce.number().optional(),
  quantity: z.coerce.number().min(1, { message: "يجب تحديد كمية صالحة (1 على الأقل)" }),
});

export type BookDropSchema = z.infer<typeof bookDropSchema>;

export const teacherPhotocopySchema = z.object({
  teacherId: z.string().min(1, { message: "الأستاذ مطلوب" }),
  pages: z.coerce.number().min(1, { message: "يجب إدخال عدد صفحات صالح (1 على الأقل)" }),
});

export type TeacherPhotocopySchema = z.infer<typeof teacherPhotocopySchema>;

export const studentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().min(1, { message: "اللقب مطلوب!" }),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().min(1, { message: "العنوان مطلوب!" }),
  birthday: z.coerce.date({ message: "تاريخ الميلاد مطلوب!" }),
  sex: z.enum(["MALE", "FEMALE"], { message: "الجنس مطلوب!" }),
  gradeId: z.coerce.number().min(1, { message: "المستوى مطلوب!" }),
  classes: z.array(z.number()).optional(),
  parentPhoneNumbers: z.array(z.string()).optional(),
});

export type StudentSchema = z.infer<typeof studentSchema>;

export const getStudentSchema = (t?: (key: string) => string) => {
  if (!t) return studentSchema;
  return z.object({
    id: z.string().optional(),
    name: z.string().min(1, { message: t("errors.nameRequired") }),
    surname: z.string().min(1, { message: t("errors.surnameRequired") }),
    phone: z.string().optional().or(z.literal("")),
    address: z.string().min(1, { message: t("errors.addressRequired") }),
    birthday: z.coerce.date({ message: t("errors.birthdayRequired") }),
    sex: z.enum(["MALE", "FEMALE"], { message: t("errors.sexRequired") }),
    gradeId: z.coerce.number().min(1, { message: t("errors.gradeRequired") }),
    classes: z.array(z.number()).optional(),
    parentPhoneNumbers: z.array(z.string()).optional(),
  });
};

export const parentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().min(1, { message: "اللقب مطلوب!" }),
  phone: z.string().min(1, { message: "رقم الهاتف مطلوب!" }),
  address: z.string().min(1, { message: "العنوان مطلوب!" }),
  students: z.array(z.string()).optional(),
});

export type ParentSchema = z.infer<typeof parentSchema>;

// UPDATED: lessonSchema for derived name, auto-fetched teacher, branch lock, and single lesson type constraint
export const lessonSchema = z
  .object({
    id: z.coerce.number().optional(),
    name: z.string().optional(),
    day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
    startTime: z.string().min(1, { message: "وقت البدء مطلوب!" }),
    endTime: z.string().min(1, { message: "وقت الانتهاء مطلوب!" }),
    classroomId: z.coerce.number().min(1, { message: "القاعة مطلوبة!" }),
    subjectId: z.coerce.number().optional(),
    classId: z.coerce.number().min(1, { message: "القسم مطلوب!" }),
    teacherId: z.string().optional(),
    branchId: z.coerce.number().optional(),
    isExtra: z.boolean().optional(),
    extraFee: z.coerce.number().optional().nullable(),
    isCatchUp: z.boolean().optional(),
    isFree: z.boolean().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
  })
  .refine(
    (data) => {
      const activeFlags = [Boolean(data.isExtra), Boolean(data.isCatchUp), Boolean(data.isFree)].filter(Boolean);
      return activeFlags.length <= 1;
    },
    {
      message: "يمكن للحصة أن تكون من نوع واحد فقط (عادية، إضافية، استدراكية، أو مجانية)",
      path: ["isExtra"],
    }
  );

export type LessonSchema = z.infer<typeof lessonSchema>;

// ADDED: A validation schema for the new Classroom model
export const classroomSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم القاعة مطلوب!" }),
});

export type ClassroomSchema = z.infer<typeof classroomSchema>;

export const announcementSchema = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().min(1, { message: "عنوان الاعلان مطلوب!" }),
    description: z.string().min(1, { message: "وصف الاعلان مطلوب!" }),
    // isPinned will be a boolean, coming from a checkbox
    isPinned: z.boolean().optional(),
    // classes will be an optional array of numbers (class IDs)
    classes: z.array(z.coerce.number()).optional(),
    // branchId: null or empty/0 for whole school, or specific branch ID
    branchId: z.coerce.number().optional().nullable(),
    // temporary announcement support
    isTemporary: z.boolean().optional(),
    expiresAt: z.string().optional().nullable().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.isTemporary) {
        return !!data.expiresAt && !isNaN(new Date(data.expiresAt).getTime());
      }
      return true;
    },
    {
      message: "تاريخ ووقت انتهاء الصلاحية مطلوب للإعلانات المؤقتة!",
      path: ["expiresAt"],
    }
  );

export type AnnouncementSchema = z.infer<typeof announcementSchema>;

export const voucherPaymentTypeEnum = z.enum([
  "INSCRIPTION",
  "TUITION_4SESSION",
  "BOOK",
  "EXTRA_SESSION",
  "CATCHUP",
  "WORKSHOP",
]);

export const voucherSchema = z.object({
  id: z.coerce.number().optional(),
  studentId: z.string().min(1, { message: "التلميذ مطلوب!" }),
  classId: z.coerce.number().min(1, { message: "القسم مطلوب!" }),
  paymentType: voucherPaymentTypeEnum,
  amount: z.coerce.number().min(0, { message: "المبلغ يجب أن يكون 0 أو أكثر." }),
  isPartial: z.boolean().optional().default(false),
  completesVoucherId: z.coerce.number().optional().nullable(),
  remainingBalance: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  isWaivedSibling: z.boolean().optional(),
  feeOverriddenByOwner: z.boolean().optional(),
  feeOverrideNote: z.string().optional(),
});

export type VoucherSchema = z.infer<typeof voucherSchema>;

export const voucherEditSchema = z.object({
  voucherId: z.coerce.number().min(1),
  fieldName: z.string().min(1),
  newValue: z.string(),
  reason: z.string().min(1, { message: "سبب التعديل إلزامي لضمان أثر المراجعة." }),
});

export type VoucherEditSchema = z.infer<typeof voucherEditSchema>;

export const voucherSeriesSchema = z.object({
  id: z.coerce.number().min(1),
  currentNumber: z.coerce.number().min(0, { message: "رقم البداية يجب أن يكون 0 أو أكثر." }),
});

export type VoucherSeriesSchema = z.infer<typeof voucherSeriesSchema>;

export const familySchema = z.object({
  id: z.coerce.number().optional(),
  payerStudentId: z.string().optional().nullable(),
  studentIds: z.array(z.string()).min(1, { message: "يجب تحديد تلميذ واحد على الأقل." }),
});

export type FamilySchema = z.infer<typeof familySchema>;

export const enrollmentTransferSchema = z.object({
  fromEnrollmentId: z.coerce.number().min(1, { message: "التسجيل السابق مطلوب." }),
  toClassId: z.coerce.number().min(1, { message: "القسم الجديد مطلوب." }),
  studentId: z.string().min(1, { message: "التلميذ مطلوب." }),
  transferredSessions: z.coerce.number().min(0, { message: "عدد الحصص المنقولة يجب أن يكون 0 أو أكثر." }),
  notes: z.string().optional(),
});

export type EnrollmentTransferSchema = z.infer<typeof enrollmentTransferSchema>;

// Backward compatibility alias while replacing Payment
export const paymentSchema = voucherSchema;
export type PaymentSchema = VoucherSchema;


const workshopSessionSchema = z.object({
    startTime: z.string().min(1, { message: "وقت بدء الحصة مطلوب!" }),
    endTime: z.string().min(1, { message: "وقت نهاية الحصة مطلوب!" }),
}).refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
});

export const workshopSchema = z.object({
    id: z.coerce.number().optional(),
    title: z.string().min(1, { message: "اسم الدورة مطلوب!" }),
    description: z.string().optional(),
    price: z.coerce.number().min(0, { message: "يجب أن يكون المبلغ أكبر من 0." }),
    teacherName: z.string().min(1, { message: "اسم الاستاذ مطلوب!" }),
    sessions: z.array(workshopSessionSchema).min(1, { message: "مطلوب حصة واحدة على الأقل!" }),
});

export type WorkshopSchema = z.infer<typeof workshopSchema>;

// UPDATED: Schema for registering a new participant with required gender and no email
export const registerParticipantSchema = z.object({
  workshopId: z.coerce.number(),
  name: z.string().min(1, { message: "الاسم الكامل مطلوب!" }),
  gender: z.enum(["MALE", "FEMALE"], { errorMap: () => ({ message: "الجنس مطلوب!" }) }),
  phone: z.string().optional(),
  // Initial payment fields are optional
  amount: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export type RegisterParticipantSchema = z.infer<typeof registerParticipantSchema>;


// ADDED: Schema for adding a subsequent payment to an existing participant
export const workshopPaymentSchema = z.object({
    id: z.coerce.number().optional(), // For updating a payment
    amount: z.coerce.number().min(0.01, { message: "يجب أن يكون المبلغ أكبر من 0!" }),
    notes: z.string().optional(),
    participantId: z.coerce.number(),
    workshopId: z.coerce.number(),
});

export type WorkshopPaymentSchema = z.infer<typeof workshopPaymentSchema>;

export const refundSchema = z.object({
  voucherId: z.coerce.number({ required_error: "معرف الوصل مطلوب" }),
  amount: z.coerce.number().positive({ message: "يجب أن يكون مبلغ الاسترجاع أكبر من 0!" }),
  reason: z.string().min(3, { message: "سبب الاسترداد إلزامي لضمان سجل المراجعة (3 أحرف على الأقل)." }),
});

export type RefundSchema = z.infer<typeof refundSchema>;

export const accountSchema = z.object({
  id: z.string().optional(),
  username: z.string().min(3, { message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" }),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }).optional().or(z.literal("")),
  name: z.string().min(1, { message: "الاسم مطلوب" }),
  role: z.enum(["OWNER", "BRANCH_ADMIN", "TEACHER"]),
  branchId: z.coerce.number().optional().nullable(),
  email: z.string().email({ message: "بريد إلكتروني غير صالح" }).optional().nullable().or(z.literal("")),
});

export type AccountSchema = z.infer<typeof accountSchema>;

export const branchSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم الفرع مطلوب!" }),
  address: z.string().optional().default(""),
  phone: z.string().optional().nullable().or(z.literal("")),
  manager: z.string().optional().nullable().or(z.literal("")),
});

export type BranchSchema = z.infer<typeof branchSchema>;

export const classroomConfigSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم القاعة مطلوب!" }),
  branchId: z.coerce.number().min(1, { message: "الفرع مطلوب!" }),
});

export type ClassroomConfigSchema = z.infer<typeof classroomConfigSchema>;

export const levelConfigSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم المستوى مطلوب!" }),
});

export type LevelConfigSchema = z.infer<typeof levelConfigSchema>;

export const formationLanguageConfigSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم اللغة مطلوب!" }),
});

export type FormationLanguageConfigSchema = z.infer<typeof formationLanguageConfigSchema>;

export const formationLevelConfigSchema = z.object({
  id: z.coerce.number().optional(),
  languageId: z.coerce.number().min(1, { message: "اللغة مطلوبة!" }),
  levelNumber: z.coerce.number().min(1, { message: "رقم المستوى مطلوب!" }).optional(),
  name: z.string().min(1, { message: "اسم المستوى مطلوب!" }),
  lumpSumPrice: z.coerce.number().min(0, { message: "السعر غير صالح!" }).optional(),
});

export type FormationLevelConfigSchema = z.infer<typeof formationLevelConfigSchema>;

export const academicYearConfigSchema = z.object({
  id: z.coerce.number().optional(),
  label: z.string().min(1, { message: "تسمية السنة الدراسية مطلوبة (مثال: 2026-2027)!" }),
  startDate: z.string().min(1, { message: "تاريخ البداية مطلوب!" }),
  endDate: z.string().min(1, { message: "تاريخ النهاية مطلوب!" }),
});

export type AcademicYearConfigSchema = z.infer<typeof academicYearConfigSchema>;