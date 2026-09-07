import { z } from "zod";

export const subjectSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم المادة مطلوب!" }),
  teachers: z.array(z.string()), //teacher ids
});

export type SubjectSchema = z.infer<typeof subjectSchema>;

export const classSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم القسم مطلوب!" }),
  capacity: z.coerce.number().min(1, { message: "سعة القسم مطلوبة!" }),
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
  username: z
    .string()
    .min(4, { message: "يجب أن يكون اسم المستخدم مكونًا من 4 أحرف على الأقل!" })
    .max(20, { message: "يجب ألا يزيد طول اسم المستخدم عن 20 حرفًا!" }),
  password: z
    .string()
    .min(8, { message: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().min(1, { message: "اللقب مطلوب!" }),
  email: z
    .string()
    .email({ message: "عنوان البريد الإلكتروني غير صالح!" })
    .optional()
    .or(z.literal("")),
  phone: z.string().min(1, { message: "رقم الهاتف مطلوب!" }),
  address: z.string().optional(),
  img: z.string().optional(),
  birthday: z.coerce.date({ message: "تاريخ الميلاد مطلوب!" }),
  sex: z.enum(["MALE", "FEMALE"], { message: "الجنس مطلوب!" }),
  subjects: z.array(z.number()).optional(),
  classes: z.array(z.number()).optional(),
});

export type TeacherSchema = z.infer<typeof teacherSchema>;

export const studentSchema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .min(4, { message: "يجب أن يكون اسم المستخدم مكونًا من 4 أحرف على الأقل!" })
    .max(20, { message: "يجب ألا يزيد طول اسم المستخدم عن 20 حرفًا!" }),
  password: z
    .string()
    .min(8, { message: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().min(1, { message: "اللقب مطلوب!" }),
  email: z
    .string()
    .email({ message: "عنوان البريد الإلكتروني غير صالح!" })
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  address: z.string(),
  img: z.string().optional(),
  birthday: z.coerce.date({ message: "تاريخ الميلاد مطلوب!" }),
  sex: z.enum(["MALE", "FEMALE"], { message: "الجنس مطلوب!" }),
  gradeId: z.coerce.number().min(1, { message: "المستوى مطلوب!" }),
  classes: z.array(z.number()).optional(),
});

export type StudentSchema = z.infer<typeof studentSchema>;

export const examSchema = z.object({
  id: z.coerce.number().optional(),
  // REMOVED: title is no longer needed as it will be derived from the subject.
  // ADDED: Separate fields for date and time for better UX and validation.
  startTime: z.coerce.date({ required_error: "وقت وتاريخ البدء مطلوب!" }),
  endTime: z.coerce.date({ required_error: "وقت وتاريخ الانتهاء مطلوب!" }),
  subjectId: z.coerce.number().min(1, { message: "المادة مطلوبة!" }),
  classId: z.coerce.number().min(1, { message: "القسم مطلوب!" }),
  teacherId: z.string().min(1, { message: "الاستاذ مطلوب!" }),
  // CHANGED: classroomId is now required.
  classroomId: z.coerce.number().min(1, { message: "القاعة مطلوبة!" }),
}).refine((data) => data.endTime > data.startTime, {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
});

export type ExamSchema = z.infer<typeof examSchema>;

export const parentSchema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .min(4, { message: "يجب أن يكون اسم المستخدم مكونًا من 4 أحرف على الأقل!" })
    .max(20, { message: "يجب ألا يزيد طول اسم المستخدم عن 20 حرفًا!" }),
  password: z
    .string()
    .min(8, { message: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "الاسم مطلوب!" }),
  surname: z.string().min(1, { message: "اللقب مطلوب!" }),
  email: z
    .string()
    .email({ message: "عنوان البريد الإلكتروني غير صالح!" })
    .optional()
    .or(z.literal("")),
  phone: z.string().min(1, { message: "رقم الهاتف مطلوب!" }),
  address: z.string().min(1, { message: "العنوان مطلوب!" }),
  img: z.string().optional(),
  students: z.array(z.string()).optional(),
});

export type ParentSchema = z.infer<typeof parentSchema>;

export const courseSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "عنوان الدرس مطلوب!" }),
  description: z.string().optional(),
  subjectId: z.coerce.number().min(1, { message: "المادة مطلوبة!" }),
  teacherId: z.string().min(1, { message: "الاستاذ مطلوب!" }),
});

export type CourseSchema = z.infer<typeof courseSchema>;

// UPDATED: lessonSchema to use classroomId instead of location
export const lessonSchema = z.object({
    id: z.coerce.number().optional(),
    name: z.string().min(1, { message: "عنوان الحصة مطلوب!" }),
    day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
    startTime: z.string().min(1, { message: "وقت البدء مطلوب!" }),
    endTime: z.string().min(1, { message: "وقت الانتهاء مطلوب!" }),
    classroomId: z.coerce.number().min(1, { message: "القاعة مطلوبة!" }),
    subjectId: z.coerce.number().min(1, { message: "المادة مطلوبة!" }),
    classId: z.coerce.number().min(1, { message: "القسم مطلوب!" }),
    teacherId: z.string().min(1, { message: "الاستاذ مطلوب!" }),
  }).refine((data) => data.endTime > data.startTime, {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
  });

export type LessonSchema = z.infer<typeof lessonSchema>;

// ADDED: A validation schema for the new Classroom model
export const classroomSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "اسم القاعة مطلوب!" }),
});

export type ClassroomSchema = z.infer<typeof classroomSchema>;

export const eventSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "عنوان الحدث مطلوب!" }),
  description: z.string().optional(),
  startTime: z.coerce.date({ message: "وقت البدء مطلوب!" }),
  endTime: z.coerce.date({ message: "وقت الانتهاء مطلوب!" }),
  // Changed from classId to classes, which is an optional array of numbers
  classes: z.array(z.coerce.number()).optional(),
}).refine((data) => data.endTime > data.startTime, {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
});

export type EventSchema = z.infer<typeof eventSchema>;

export const announcementSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "عنوان الاعلان مطلوب!" }),
  description: z.string().min(1, { message: "وصف الاعلان مطلوب!" }),
  // isPinned will be a boolean, coming from a checkbox
  isPinned: z.boolean().optional(),
  // classes will be an optional array of numbers (class IDs)
  classes: z.array(z.coerce.number()).optional(),
});

export type AnnouncementSchema = z.infer<typeof announcementSchema>;

export const paymentSchema = z.object({
  id: z.coerce.number().optional(),
  amount: z.coerce.number().min(0.01, { message: "يجب أن يكون المبلغ أكبر من 0." }),
  notes: z.string().optional(),
  studentId: z.string().min(1, { message: "التلميذ مطلوب!" }),
  classId: z.coerce.number().min(1, { message: "القسم مطلوب!" }),
});

export type PaymentSchema = z.infer<typeof paymentSchema>;

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

// ADDED: Schema for registering a new participant along with their initial payment
export const registerParticipantSchema = z.object({
  workshopId: z.coerce.number(),
  name: z.string().min(1, { message: "الاسم الكامل مطلوب!" }),
  email: z.string().email({ message: "عنوان البريد الإلكتروني غير صالح!" }).optional().or(z.literal('')),
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
  amount: z.coerce.number().min(0.01, { message: "يجب أن يكون المبلغ أكبر من 0!" }),
  notes: z.string().optional(),
  // One of these two must be provided
  paymentId: z.coerce.number().optional(),
  workshopPaymentId: z.coerce.number().optional(),
}).refine(data => data.paymentId || data.workshopPaymentId, {
    message: "يجب ربط عملية الاسترداد إما بدفع خاص بقسم أو بدفع خاص بدورة.",
    path: ["paymentId"], // This error can be shown near the payment fields
});

export type RefundSchema = z.infer<typeof refundSchema>;