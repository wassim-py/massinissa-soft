"use server";

import { revalidatePath } from "next/cache";
import {
  ClassSchema,
  ExamSchema,
  StudentSchema,
  SubjectSchema,
  TeacherSchema,
  ParentSchema,
  CourseSchema,
  LessonSchema,
  EventSchema,
  AnnouncementSchema,
  PaymentSchema,
  WorkshopSchema,
  RegisterParticipantSchema,
  WorkshopPaymentSchema,
  RefundSchema,
  
} from "./formValidationSchemas";
import prisma from "./prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { adminStorage } from "./firebase-admin";
import * as ExcelJS from "exceljs";

type CurrentState = { success: boolean; error: boolean; message?: string };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type FirebaseFile = {
  name: string;
  url: string;
  storagePath: string;
};

// =================================================================
// SUBJECT ACTIONS
// =================================================================

export const createSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    await prisma.subject.create({
      data: {
        name: data.name,
        teachers: {
          connect: data.teachers.map((teacherId) => ({ id: teacherId })),
        },
      },
    });

    revalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم انشاء المادة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء المادة." };
  }
};

export const updateSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    await prisma.subject.update({
      where: {
        id: data.id,
      },
      data: {
        name: data.name,
        teachers: {
          set: data.teachers.map((teacherId) => ({ id: teacherId })),
        },
      },
    });

    revalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم تحديث المادة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث المادة." };
  }
};

export const deleteSubject = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.subject.delete({
      where: {
        id: parseInt(id),
      },
    });

    revalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم حذف المادة بنجاح." };
  } catch (err) {
    // Check if the error is a known Prisma error for foreign key constraints
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") {
        return {
          success: false,
          error: true,
          message:
            "لا يمكن حذف المادة لأنها ما زالت مرتبطة بدرس أو أكثر. يرجى إزالة الدروس المرتبطة أولاً.",
        };
      }
    }
    // Handle other errors
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف المادة." };
  }
};

// =================================================================
// CLASS ACTIONS
// =================================================================

export const createClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    await prisma.class.create({
      data,
    });

    revalidatePath("/list/classes");
    return { success: true, error: false, message: "تم انشاء القسم بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء القسم." };
  }
};

export const updateClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    await prisma.class.update({
      where: {
        id: data.id,
      },
      data,
    });

    revalidatePath("/list/classes");
    return { success: true, error: false, message: "تم تحديث القسم بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث القسم." };
  }
};

export const deleteClass = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    // This simple delete call will now work because the database schema
    // has been updated to automatically cascade the deletion to related lessons.
    // Prisma will also automatically handle the cleanup of the many-to-many
    // relationship with students.
    await prisma.class.delete({
      where: {
        id: parseInt(id),
      },
    });

    revalidatePath("/list/classes");
    return { success: true, error: false, message: "تم حذف القسم بنجاح." };
  } catch (err) {
    // This is a general catch-all for any other unexpected errors.
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف القسم." };
  }
};

// =================================================================
// TEACHER ACTIONS
// =================================================================

export const createTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  try {
    const user = await (await clerkClient()).users.createUser({
      username: data.username,
      password: data.password,
      firstName: data.name,
      lastName: data.surname,
      publicMetadata: { role: "teacher" },
    });

    await prisma.teacher.create({
      data: {
        id: user.id,
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone,
        address: data.address || null,
        img: data.img || null,
        sex: data.sex,
        birthday: data.birthday,
        subjects: {
          connect: data.subjects?.map((subjectId: number) => ({
            id: subjectId,
          })),
        },
        // ADDED: Connect the teacher to the selected classes
        classes: {
          connect: data.classes?.map((classId: number) => ({
            id: classId,
          })),
        },
      },
    });

    revalidatePath("/list/teachers");
    return { success: true, error: false, message: "تم انشاء الاستاذ بنجاح." };
  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: `${(err as Error).message}` };
  }
};

export const updateTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للاستاذ." };
  }
  try {
    await (await clerkClient()).users.updateUser(data.id, {
      username: data.username,
      ...(data.password !== "" && { password: data.password }),
      firstName: data.name,
      lastName: data.surname,
    });

    await prisma.teacher.update({
      where: {
        id: data.id,
      },
      data: {
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone,
        address: data.address || null,
        img: data.img || null,
        sex: data.sex,
        birthday: data.birthday,
        subjects: {
          set: data.subjects?.map((subjectId: number) => ({
            id: subjectId,
          })),
        },
        // ADDED: Update the teacher's connected classes
        classes: {
          set: data.classes?.map((classId: number) => ({
            id: classId,
          })),
        },
      },
    });
    revalidatePath("/list/teachers");
    return { success: true, error: false, message: "تم تحديث الاستاذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الاستاذ." };
  }
};

export const deleteTeacher = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "لا يوجد معرف للاستاذ." };
  }

  try {
    // --- Step 1: Fetch the teacher record to get their image URL ---
    const teacherToDelete = await prisma.teacher.findUnique({
      where: { id },
      select: { img: true },
    });

    // --- Step 2: If an image exists, delete it from Cloudinary ---
    if (teacherToDelete && teacherToDelete.img) {
      const publicId = getPublicIdFromUrl(teacherToDelete.img);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Successfully deleted image ${publicId} from Cloudinary.`);
        } catch (cloudinaryError) {
          console.error("Cloudinary deletion failed (this might be okay):", cloudinaryError);
        }
      }
    }

    // --- Step 3: Delete the user from Clerk ---
    try {
      await (await clerkClient()).users.deleteUser(id);
    } catch (err: any) {
      if (err.status === 404) {
        console.log(
          `User ${id} not found in Clerk. Proceeding to delete from local DB.`
        );
      } else {
        throw err;
      }
    }

    // --- Step 4: Delete the teacher from your Prisma database ---
    await prisma.teacher.delete({
      where: {
        id: id,
      },
    });

    revalidatePath("/list/teachers");
    return { success: true, error: false, message: "تم حذف الاستاذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الاستاذ." };
  }
};

// =================================================================
// STUDENT ACTIONS
// =================================================================

export const createStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  try {
    // This capacity check is no longer valid for multiple classes and has been removed.
    // A more complex check could be added here in the future if needed.

    const user = await (await clerkClient()).users.createUser({
      username: data.username,
      password: data.password,
      firstName: data.name,
      lastName: data.surname,
      publicMetadata: { role: "student" },
    });

    await prisma.student.create({
      data: {
        id: user.id,
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address,
        img: data.img || null,
        sex: data.sex,
        birthday: data.birthday,
        gradeId: data.gradeId,
        // ADDED: Connect the student to the selected classes
        classes: {
          connect: data.classes?.map((classId: number) => ({
            id: classId,
          })),
        },
      },
    });

    revalidatePath("/list/students");
    return { success: true, error: false, message: "تم انشاء التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء التلميذ." };
  }
};

export const updateStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }
  try {
    await (await clerkClient()).users.updateUser(data.id, {
      username: data.username,
      ...(data.password !== "" && { password: data.password }),
      firstName: data.name,
      lastName: data.surname,
    });

    await prisma.student.update({
      where: {
        id: data.id,
      },
      data: {
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address,
        img: data.img || null,
        sex: data.sex,
        birthday: data.birthday,
        gradeId: data.gradeId,
        // ADDED: Update the student's connected classes
        classes: {
          set: data.classes?.map((classId: number) => ({
            id: classId,
          })),
        },
      },
    });
    revalidatePath("/list/students");
    return { success: true, error: false, message: "تم تحديث التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث التلميذ." };
  }
};

const getPublicIdFromUrl = (url: string): string | null => {
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    // Ensure 'upload' is in the URL and there are parts after it
    if (uploadIndex === -1 || uploadIndex + 2 >= parts.length) {
      return null;
    }
    const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/');
    // Remove the file extension
    return publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));
  } catch (e) {
    console.error("Could not parse public_id from URL:", e);
    return null;
  }
};

export const deleteStudent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }

  try {
    // --- Step 1: Fetch the student record to get their image URL ---
    const studentToDelete = await prisma.student.findUnique({
      where: { id },
      select: { img: true }, // We only need the 'img' field
    });

    // --- Step 2: If an image exists, delete it from Cloudinary ---
    if (studentToDelete && studentToDelete.img) {
      const publicId = getPublicIdFromUrl(studentToDelete.img);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Successfully deleted image ${publicId} from Cloudinary.`);
        } catch (cloudinaryError) {
          // Log the error but do not stop the process. The image might already be deleted.
          console.error("Cloudinary deletion failed (this might be okay):", cloudinaryError);
        }
      }
    }

    // --- Step 3: Delete the user from Clerk ---
    try {
      await (await clerkClient()).users.deleteUser(id);
    } catch (err: any) {
      if (err.status === 404) {
        console.log(`User ${id} not found in Clerk. Proceeding to delete from local DB.`);
      } else {
        throw err; // Re-throw other Clerk errors
      }
    }

    // --- Step 4: Delete the student from your Prisma database ---
    await prisma.student.delete({
      where: {
        id: id,
      },
    });

    revalidatePath("/list/students");
    return { success: true, error: false, message: "تم حذف التلميذ بنجاح." };

  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف التلميذ." };
  }
};

// =================================================================
// EXAM ACTIONS
// =================================================================

// Helper function to check for scheduling conflicts for an exam
const checkForExamConflicts = async (examData: ExamSchema) => {

  const { startTime, endTime } = examData; 
  const examIdToExclude = examData.id ? { id: { not: examData.id } } : {};

  const baseConflictQuery: Prisma.ExamWhereInput = {
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    ...examIdToExclude,
  };

  // Check for a teacher being double-booked
  const teacherConflict = await prisma.exam.findFirst({
    where: { ...baseConflictQuery, teacherId: examData.teacherId },
  });
  if (teacherConflict) return `تعارض في الجدول: هذا الأستاذ يشرف بالفعل على اختبار في هذا التوقيت.`;

  // Check for a class having two exams at once
  const classConflict = await prisma.exam.findFirst({
    where: { ...baseConflictQuery, classId: examData.classId },
  });
  if (classConflict) return `تعارض في الجدول: هذه القسم لديه بالفعل اختبار مبرمج في هذا التوقيت.`;

  // Check for a classroom being double-booked
  const classroomConflict = await prisma.exam.findFirst({
    where: { ...baseConflictQuery, classroomId: examData.classroomId },
  });
  if (classroomConflict) return `تعارض في الجدول: هذه القاعة محجوزة بالفعل في هذا التوقيت.`;
  
  return null;
};

export const createExam = async (
  currentState: CurrentState,
  data: ExamSchema
) => {
  try {
    // 1. Check for conflicts before proceeding
    const conflict = await checkForExamConflicts(data);
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    // 2. Get the subject name to use as the title
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) {
      return { success: false, error: true, message: "المادة المحددة غير موجودة." };
    }
    const title = subject.name;

    await prisma.exam.create({
      data: {
        title,
        startTime: data.startTime,
        endTime: data.endTime,
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
        classroomId: data.classroomId,
      },
    });

    revalidatePath("/list/exams");
    return { success: true, error: false, message: "تم انشاء الاختبار بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء الاختبار." };
  }
};

export const updateExam = async (
  currentState: CurrentState,
  data: ExamSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للاختبار." };
  }
  try {
    const conflict = await checkForExamConflicts(data);
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) {
      return { success: false, error: true, message: "المادة المحددة غير موجودة." };
    }
    const title = subject.name;

    await prisma.exam.update({
      where: {
        id: data.id,
      },
      data: {
        title,
        startTime: data.startTime,
        endTime: data.endTime,
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
        classroomId: data.classroomId,
      },
    });

    revalidatePath("/list/exams");
    return { success: true, error: false, message: "تم تحديث الاختبار بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الاختبار." };
  }
};

export const deleteExam = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;

  try {
    await prisma.exam.delete({
      where: {
        id: parseInt(id),
      },
    });

    revalidatePath("/list/exams");
    return { success: true, error: false, message: "تم حذف الاختبار بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الاختبار." };
  }
};

// =================================================================
// PARENT ACTIONS
// =================================================================

export const createParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  try {
    const user = await (await clerkClient()).users.createUser({
      username: data.username,
      password: data.password,
      firstName: data.name,
      lastName: data.surname,
      publicMetadata: { role: "parent" },
    });

    await prisma.parent.create({
      data: {
        id: user.id,
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone,
        address: data.address,
        img: data.img || null,
        students: {
          connect: data.students?.map((studentId: string) => ({
            id: studentId,
          })),
        },
      },
    });

    revalidatePath("/list/parents");
    return { success: true, error: false, message: "تم انشاء ولي الامر بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء ولي الامر." };
  }
};

export const updateParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف لولي الامر." };
  }
  try {
    await (await clerkClient()).users.updateUser(data.id, {
      username: data.username,
      ...(data.password !== "" && { password: data.password }),
      firstName: data.name,
      lastName: data.surname,
    });

    await prisma.parent.update({
      where: {
        id: data.id,
      },
      data: {
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone,
        address: data.address,
        img: data.img || null,
        students: {
          set: data.students?.map((studentId: string) => ({
            id: studentId,
          })),
        },
      },
    });
    revalidatePath("/list/parents");
    return { success: true, error: false, message: "تم تحديث ولي الامر بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث ولي الامر." };
  }
};

export const deleteParent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "فشل في تحديث ولي الامر." };
  }

  try {
    try {
      await (await clerkClient()).users.deleteUser(id);
    } catch (err: any) {
      if (err.status === 404) {
        console.log(
          `User ${id} not found in Clerk. Proceeding to delete from local DB.`
        );
      } else {
        throw err;
      }
    }

    await prisma.parent.delete({
      where: {
        id: id,
      },
    });

    revalidatePath("/list/parents");
    return { success: true, error: false, message: "تم حذف  ولي الامر بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف ولي الامر." };
  }
};

// =================================================================
// LESSON ACTIONS
// =================================================================

// Helper function to combine a time string into a standardized Date object.
const combineDateAndTime = (time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(0);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
};

const checkForConflicts = async (lessonData: LessonSchema) => {
    const startTime = combineDateAndTime(lessonData.startTime);
    const endTime = combineDateAndTime(lessonData.endTime);
    const lessonIdToExclude = lessonData.id ? { id: { not: lessonData.id } } : undefined;

    const baseConflictQuery: Prisma.LessonWhereInput = {
      day: lessonData.day,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...lessonIdToExclude,
    };

    const teacherConflict = await prisma.lesson.findFirst({
      where: { ...baseConflictQuery, teacherId: lessonData.teacherId },
    });
    if (teacherConflict) return `تعارض في الجدول: هذا الأستاذ لديه حصة مجدولة بالفعل في هذا الوقت.`;

    const classConflict = await prisma.lesson.findFirst({
      where: { ...baseConflictQuery, classId: lessonData.classId },
    });
    if (classConflict) return `تعارض في الجدول: هذا القسم لديه حصة مجدولة بالفعل في هذا الوقت.`;

    if (lessonData.classroomId != null) { // Check for non-null/undefined values, including 0
      const locationConflict = await prisma.lesson.findFirst({
        where: { ...baseConflictQuery, classroomId: lessonData.classroomId },
      });
      if (locationConflict) {
         const classroom = await prisma.classroom.findUnique({where: {id: lessonData.classroomId}});
        return `تعارض في القاعة: القاعة "${classroom?.name}" محجوزة بالفعل في هذا الوقت.`;
      }
    }
    return null;
};


export const createLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  try {
    const conflict = await checkForConflicts(data);
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const startTime = combineDateAndTime(data.startTime);
    const endTime = combineDateAndTime(data.endTime);

    await prisma.lesson.create({
      data: {
        name: data.name,
        day: data.day,
        startTime: startTime,
        endTime: endTime,
        // FIX: Correctly handle `0` as a valid ID
        classroomId: data.classroomId != null ? data.classroomId : null,
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
      },
    });

    revalidatePath("/list/lessons");
    return { success: true, error: false, message: "تم برمجة الحصة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في برمجة الحصة." };
  }
};

export const updateLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للحصة." };
  }
  try {
    const conflict = await checkForConflicts(data);
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }
    
    const startTime = combineDateAndTime(data.startTime);
    const endTime = combineDateAndTime(data.endTime);

    await prisma.lesson.update({
      where: { id: data.id },
      data: {
        name: data.name,
        day: data.day,
        startTime: startTime,
        endTime: endTime,
        // FIX: Correctly handle `0` as a valid ID
        classroomId: data.classroomId != null ? data.classroomId : null,
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
      },
    });

    revalidatePath("/list/lessons");
    return { success: true, error: false, message: "تم تحديث الحصة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الحصة." };
  }
};


export const deleteLesson = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.lesson.delete({
      where: {
        id: parseInt(id),
      },
    });

    revalidatePath("/list/lessons");
    return { success: true, error: false, message: "تم حذف الحصة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الحصة." };
  }
};

// =================================================================
// COURSE ACTIONS
// =================================================================

const deleteFilesFromFirebase = async (storagePaths: string[]) => {
    if (storagePaths.length === 0) return;

    // Check if adminStorage is available before proceeding.
    if (adminStorage) {
        const bucket = adminStorage.bucket();
        try {
            await Promise.all(storagePaths.map(path => bucket.file(path).delete()));
            console.log(`Successfully deleted ${storagePaths.length} files from Firebase Storage.`);
        } catch (error) {
            console.error("Firebase file deletion failed (this might be okay):", error);
        }
    } else {
        console.error("Firebase Admin not initialized. Skipping file deletion.");
    }
};

export const createCourse = async (
  currentState: CurrentState,
  data: CourseSchema & { files: FirebaseFile[] }
) => {
  try {
    const newCourse = await prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        files: {
          create: data.files?.map((file) => ({
            name: file.name,
            url: file.url,
            storagePath: file.storagePath,
          })),
        },
      },
    });

    revalidatePath("/list/courses");
    return {
      success: true,
      error: false,
      message: "تم انشاء الدرس بنجاح.",
      courseId: newCourse.id,
    };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء الدرس." };
  }
};

export const updateCourse = async (
  currentState: CurrentState,
  data: CourseSchema & { files: FirebaseFile[] }
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للدرس." };
  }
  try {
    // Get the current list of files for the course from the database.
    const existingFiles = await prisma.courseFile.findMany({
      where: { courseId: data.id },
      select: { storagePath: true },
    });
    const existingStoragePaths = existingFiles.map(f => f.storagePath);

    // Get the list of files submitted with the form.
    const submittedStoragePaths = new Set(data.files.map(f => f.storagePath));

    // Determine which files need to be deleted from storage.
    const storagePathsToDelete = existingStoragePaths.filter(
      path => !submittedStoragePaths.has(path)
    );

    // Delete those files from Firebase Storage.
    if (storagePathsToDelete.length > 0) {
        await deleteFilesFromFirebase(storagePathsToDelete);
    }

    // Update the course and its files in the database within a transaction
    await prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: data.id },
        data: {
          title: data.title,
          description: data.description,
          subjectId: data.subjectId,
          teacherId: data.teacherId,
          files: {
            deleteMany: {},
            create: data.files.map((file) => ({
              name: file.name,
              url: file.url,
              storagePath: file.storagePath,
            })),
          },
        },
      });
    });

    revalidatePath("/list/courses");
    return {
      success: true,
      error: false,
      message: "تم تحديث الدرس بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الدرس." };
  }
};

export const deleteCourse = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    // 1. Get the list of all files associated with this course
    const filesToDelete = await prisma.courseFile.findMany({
      where: { courseId: parseInt(id) },
      select: { storagePath: true },
    });

    // 2. Delete those files from Firebase Storage
    if (filesToDelete.length > 0) {
        const storagePaths = filesToDelete.map(f => f.storagePath);
        await deleteFilesFromFirebase(storagePaths);
    }
    
    // 3. Delete the course from the database. The cascade will handle the file records.
    await prisma.course.delete({
      where: {
        id: parseInt(id),
      },
    });

    revalidatePath("/list/courses");
    return {
      success: true,
      error: false,
      message: "تم حذف الدرس بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الدرس." };
  }
};

// =================================================================
// SCHOOL SETTINGS ACTIONS
// =================================================================

export const updateExamSeasonStatus = async (
  currentState: CurrentState,
  data: FormData
) => {
  const isActive = data.get("isActive") === "true";

  try {
    // Use upsert to create the setting if it doesn't exist, or update it if it does.
    await prisma.schoolSetting.upsert({
      where: { key: "exam_season_active" },
      update: { value: String(isActive) },
      create: { key: "exam_season_active", value: String(isActive) },
    });

    revalidatePath("/list/exams");
    return {
      success: true,
      error: false,
      message: `تم ${isActive ? "تفعيل" : "إلغاء تفعيل"} فترة الامتحانات.`,
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "فشل في تغيير الاعدادات.",
    };
  }
};

// =================================================================
// RESULT ACTIONS
// =================================================================

export const saveResults = async (
  examId: number,
  currentState: CurrentState,
  data: FormData
) => {
  // This is a more robust way to get all form entries that start with "scores"
  const scoreEntries = Array.from(data.entries()).filter(([key]) => key.startsWith('scores'));

  if (scoreEntries.length === 0) {
    return { success: false, error: true, message: "لم يتم تقديم أي علامات." };
  }

  try {
    // Use a transaction to ensure all score updates succeed or fail together
    await prisma.$transaction(async (tx) => {
      for (const [key, scoreValue] of scoreEntries) {
        // Extract studentId from the input name, e.g., "scores[student123]"
        const studentId = key.substring(key.indexOf('[') + 1, key.indexOf(']'));

        // Only process if a score was actually entered
        if (scoreValue && typeof scoreValue === 'string' && scoreValue.trim() !== "") {
          const score = parseFloat(scoreValue);

          // Validate the score
          if (isNaN(score) || score < 0 || score > 20) {
            // If validation fails, roll back the transaction
            throw new Error(`علامة غير صالحة للتلميذ ${studentId}. يجب أن تكون بين 0 و20.`);
          }

          // Upsert the result: update if it exists, create if it doesn't
          await tx.result.upsert({
            where: {
              // CORRECTED: This compound unique identifier is now valid because of our schema change.
              examId_studentId: {
                examId: examId,
                studentId: studentId,
              },
            },
            update: {
              score: score,
            },
            create: {
              examId: examId,
              studentId: studentId,
              score: score,
            },
          });
        }
      }
    });

    // Revalidate the path to the main results page to show the new data
    revalidatePath("/list/results");
    return { success: true, error: false, message: "تم حفظ النتائج بنجاح." };

  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: err.message || "فشل في حفظ النتائج." };
  }
};

// =================================================================
// ATTENDANCE ACTIONS
// =================================================================

export const saveAttendance = async (
  lessonId: number,
  currentState: CurrentState,
  data: FormData
) => {
  // Extract all the attendance entries from the form data
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "لم يتم تقديم أي بيانات حضور." };
  }

  try {
    // Use a transaction to ensure all records are saved or none are.
    await prisma.$transaction(async (tx) => {
      // Get the start and end of the current day to find existing records
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Fetch all existing records for this specific lesson on this day
      const existingRecords = await tx.attendance.findMany({
        where: {
          lessonId: lessonId,
          date: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      // Create a map for faster lookups
      const recordsMap = new Map(existingRecords.map(r => [r.studentId, r]));
      
      const promises = [];

      // Process each student's attendance from the form
      for (const [key, value] of attendanceEntries) {
        const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
        const status = value as "PRESENT" | "ABSENT";
        const isPresent = status === "PRESENT";

        const existingRecord = recordsMap.get(studentId);

        if (existingRecord) {
          // If a record already exists, update it
          promises.push(tx.attendance.update({
            where: { id: existingRecord.id },
            data: { present: isPresent },
          }));
        } else {
          // If no record exists, create a new one
          promises.push(tx.attendance.create({
            data: {
              lessonId: lessonId,
              studentId: studentId,
              present: isPresent,
              date: new Date(), // Set the attendance date to now
            },
          }));
        }
      }

      // Execute all database operations at once
      await Promise.all(promises);
    });

    // Revalidate the path to the main attendance page to show the new data
    revalidatePath("/list/attendance");
    return { success: true, error: false, message: "تم حفظ بيانات الحضور بنجاح." };

  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حفظ بيانات الحضور." };
  }
};

// =================================================================
// EVENT ACTIONS
// =================================================================

export const createEvent = async (
  currentState: CurrentState,
  data: EventSchema
) => {
  try {
    // The 'classes' field will be an array of numbers (class IDs)
    const classIds = data.classes?.map((id: number) => ({ id }));

    await prisma.event.create({
      data: {
        title: data.title,
        description: data.description || "",
        startTime: data.startTime,
        endTime: data.endTime,
        // If classIds are provided, connect them. Otherwise, it's a school-wide event.
        ...(classIds && classIds.length > 0 && {
          classes: {
            connect: classIds,
          },
        }),
      },
    });
    revalidatePath("/list/events");
    return { success: true, error: false, message: "تم انشاء الحدث بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء الحدث." };
  }
};

export const updateEvent = async (
  currentState: CurrentState,
  data: EventSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للحدث." };
  }
  try {
    const classIds = data.classes?.map((id: number) => ({ id }));

    await prisma.event.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description || "",
        startTime: data.startTime,
        endTime: data.endTime,
        // The `set` command disconnects all previous classes and connects the new list.
        classes: {
            set: classIds,
        },
      },
    });
    revalidatePath("/list/events");
    return { success: true, error: false, message: "تم تحديث الحدث بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الحدث." };
  }
};

export const deleteEvent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.event.delete({
      where: { id: parseInt(id) },
    });
    revalidatePath("/list/events");
    return { success: true, error: false, message: "تم حذف الحدث بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الحدث." };
  }
};

// =================================================================
// ANNOUNCEMENT ACTIONS
// =================================================================

export const createAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  try {
    const classIds = data.classes?.map(id => ({ id }));

    await prisma.announcement.create({
      data: {
        title: data.title,
        description: data.description,
        isPinned: data.isPinned || false,
        // If classIds are provided, connect them. Otherwise, it's a school-wide announcement.
        ...(classIds && classIds.length > 0 && {
          classes: {
            connect: classIds,
          },
        }),
      },
    });
    revalidatePath("/list/announcements");
    return { success: true, error: false, message: "تم انشاء الاعلان بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء الاعلان." };
  }
};

export const updateAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للاعلان." };
  }
  try {
    const classIds = data.classes?.map(id => ({ id }));

    await prisma.announcement.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        isPinned: data.isPinned || false,
        // The `set` command disconnects all previous classes and connects the new list.
        classes: {
            set: classIds,
        },
      },
    });
    revalidatePath("/list/announcements");
    return { success: true, error: false, message: "تم تحديث الاعلان بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الاعلان." };
  }
};

export const deleteAnnouncement = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.announcement.delete({
      where: { id: parseInt(id) },
    });
    revalidatePath("/list/announcements");
    return { success: true, error: false, message: "تم حذف الاعلان بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الاعلان." };
  }
};

// =================================================================
// PAYMENT ACTIONS
// =================================================================

export const recordPayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  try {
    await prisma.payment.create({
      data: {
        amount: data.amount,
        notes: data.notes,
        studentId: data.studentId,
        classId: data.classId,
      },
    });

    // Revalidate the attendance page for that class to show the updated session count
    revalidatePath(`/list/attendance/class/${data.classId}`);
    // ALSO revalidate the payment history page
    revalidatePath(`/list/payments/class/${data.classId}`);
    return { success: true, error: false, message: "تم تسجيل الدفع بنجاح." };

  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تسجيل الدفع." };
  }
};

// ADDED: Action to update an existing payment record
export const updatePayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للدفع." };
  }
  try {
    await prisma.payment.update({
      where: { id: data.id },
      data: {
        amount: data.amount,
        notes: data.notes,
        // We don't allow changing the student or class of an existing payment
      },
    });
    revalidatePath(`/list/payments/class/${data.classId}`);
    revalidatePath(`/list/attendance/class/${data.classId}`);
    return { success: true, error: false, message: "تم تحديث الدفع بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الدفع." };
  }
};

export const createRefund = async (
  currentState: CurrentState,
  data: RefundSchema
) => {
  try {
    let originalPayment: { amount: number, refunds: { amount: number }[] } | null = null;

    // Use a transaction to safely read the payment and create the refund
    await prisma.$transaction(async (tx) => {
        if (data.paymentId) {
            originalPayment = await tx.payment.findUnique({
                where: { id: data.paymentId },
                include: { refunds: true },
            });
        } else if (data.workshopPaymentId) {
            originalPayment = await tx.workshopPayment.findUnique({
                where: { id: data.workshopPaymentId },
                include: { refunds: true },
            });
        } else {
            throw new Error("لم يتم تحديد أي عملية دفع للاسترجاع.");
        }

        if (!originalPayment) {
            throw new Error("لم يتم العثور على عملية الدفع الأصلية.");
        }

        const totalRefunded = originalPayment.refunds.reduce((sum, refund) => sum + refund.amount, 0);
        const remainingBalance = originalPayment.amount - totalRefunded;

        // Server-side validation to ensure refund amount is not excessive
        if (data.amount > remainingBalance) {
            throw new Error(`مبلغ الاسترجاع وقدره ${data.amount.toFixed(2)} يتجاوز الرصيد المتبقي وقدره ${remainingBalance.toFixed(2)}.`);
        }

        // Create the new refund record
        await tx.refund.create({
            data: {
                amount: data.amount,
                notes: data.notes,
                paymentId: data.paymentId,
                workshopPaymentId: data.workshopPaymentId,
            },
        });
    });

    // Revalidate paths to reflect the new financial data
    revalidatePath("/list/reports");
    revalidatePath("/list/payments");
    revalidatePath("/list/workshops");

    return { success: true, error: false, message: "تمت معالجة عملية الاسترجاع بنجاح." };

  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: (err as Error).message || "فشل في معالجة عملية الاسترجاع." };
  }
};

// =================================================================
// WORKSHOP ACTIONS
// =================================================================

export const createWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  try {
    // Use a transaction to create the workshop and its sessions together
    await prisma.$transaction(async (tx) => {
      const newWorkshop = await tx.workshop.create({
        data: {
          title: data.title,
          description: data.description,
          price: data.price,
          teacherName: data.teacherName, // Use the simple text field for the external teacher
        },
      });

      // Create the individual session records for the new workshop
      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: newWorkshop.id,
            startTime: new Date(session.startTime),
            endTime: new Date(session.endTime),
          })),
        });
      }
    });

    revalidatePath("/list/workshops");
    return { success: true, error: false, message: "تم انشاء الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في انشاء الدورة." };
  }
};

export const updateWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف الدورة." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update the main workshop details
      await tx.workshop.update({
        where: { id: data.id },
        data: {
          title: data.title,
          description: data.description,
          price: data.price,
          teacherName: data.teacherName,
        },
      });

      // 2. Delete all existing sessions for this workshop to replace them
      await tx.workshopSession.deleteMany({
        where: { workshopId: data.id },
      });

      // 3. Create the new list of sessions
      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: data.id!,
            startTime: new Date(session.startTime),
            endTime: new Date(session.endTime),
          })),
        });
      }
    });

    revalidatePath("/list/workshops");
    revalidatePath(`/list/workshops/${data.id}`);
    return { success: true, error: false, message: "تم تحديث الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث الدورة." };
  }
};


export const deleteWorkshop = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    // The database schema is set up with cascading deletes, so deleting the workshop
    // will automatically delete its related sessions, participants, payments, and attendance records.
    await prisma.workshop.delete({
      where: { id: parseInt(id) },
    });
    revalidatePath("/list/workshops");
    return { success: true, error: false, message: "تم حذف الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف الدورة." };
  }
};


// =================================================================
// WORKSHOP MANAGEMENT ACTIONS
// =================================================================

// Action to register a new participant and optionally record their first payment
export const registerParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema
) => {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create the new participant
      const newParticipant = await tx.workshopParticipant.create({
        data: {
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          workshopId: data.workshopId,
        },
      });

      // 2. If an initial payment amount was provided, create the payment record
      if (data.amount && data.amount > 0) {
        await tx.workshopPayment.create({
          data: {
            amount: data.amount,
            notes: data.notes || "دفعة التسجيل الأولية.",
            participantId: newParticipant.id,
            workshopId: data.workshopId,
          },
        });
      }
    });

    revalidatePath(`/list/workshops/${data.workshopId}`);
    return { success: true, error: false, message: "تم تسجيل التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تسجيل التلميذ." };
  }
};

// Action to update an existing participant's details
export const updateWorkshopParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema & { id: number } // Reuse schema, but ensure ID is present
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }
  try {
    await prisma.workshopParticipant.update({
      where: { id: data.id },
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
      },
    });

    revalidatePath(`/list/workshops/${data.workshopId}`);
    return { success: true, error: false, message: "تم تحديث معلومات التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث معلومات التلميذ." };
  }
};

export const deleteWorkshopParticipant = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  const workshopId = data.get("workshopId") as string;
  try {
    await prisma.workshopParticipant.delete({
      where: { id: parseInt(id) },
    });
    revalidatePath(`/list/workshops/${workshopId}`);
    return { success: true, error: false, message: "تم حذف التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف التلميذ." };
  }
};



// Action to record a subsequent payment for a workshop participant
export const addWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
    try {
        await prisma.workshopPayment.create({
            data: {
                amount: data.amount,
                notes: data.notes,
                participantId: data.participantId,
                workshopId: data.workshopId,
            }
        });
        revalidatePath(`/list/workshops/${data.workshopId}`);
        return { success: true, error: false, message: "تم تسجيل الدفع بنجاح." };
    } catch (err) {
        console.log(err);
        return { success: false, error: true, message: "فشل في تسجيل الدفع." };
    }
};

// Action to update an existing workshop payment
export const updateWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
    if (!data.id) {
        return { success: false, error: true, message: "لا يوجد معرف لعمليية الدفع." };
    }
    try {
        await prisma.workshopPayment.update({
            where: { id: data.id },
            data: {
                amount: data.amount,
                notes: data.notes,
            }
        });
        revalidatePath(`/list/workshops/${data.workshopId}`);
        return { success: true, error: false, message: "تم تحديث عملية الدفع بنجاح." };
    } catch (err) {
        console.log(err);
        return { success: false, error: true, message: "فشل في تحديث عملية الدفع." };
    }
};



// Action to save attendance for a specific workshop session
export const saveWorkshopAttendance = async (
  sessionId: number,
  currentState: CurrentState,
  data: FormData
) => {
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "لم يتم إرسال بيانات الحضور." };
  }

  const workshopSession = await prisma.workshopSession.findUnique({ where: { id: sessionId }});
  if (!workshopSession) {
    return { success: false, error: true, message: "لم يتم العثور على حصص الدورة." };
  }

  try {
    await prisma.$transaction(
      attendanceEntries.map(([key, value]) => {
        const participantId = parseInt(key.substring(key.indexOf("[") + 1, key.indexOf("]")));
        const isPresent = (value as string) === "PRESENT";

        return prisma.workshopAttendance.upsert({
          where: {
            participantId_sessionId: {
              participantId,
              sessionId,
            },
          },
          update: { present: isPresent },
          create: {
            participantId,
            sessionId,
            present: isPresent,
            date: new Date(),
          },
        });
      })
    );

    revalidatePath(`/list/workshops/${workshopSession.workshopId}`);
    return { success: true, error: false, message: "تم حفظ الحضور بنجاح." };
  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حفظ الحضور." };
  }
};


// =================================================================
// DAILY LEDGER ACTIONS
// =================================================================

export const generateDailyLedger = async (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    // 1. Fetch all payments CREATED today for INCOME.
    const [incomePayments, incomeWorkshopPayments] = await Promise.all([
        prisma.payment.findMany({
            where: { date: { gte: startOfDay, lte: endOfDay } },
        }),
        prisma.workshopPayment.findMany({
            where: { date: { gte: startOfDay, lte: endOfDay } },
        })
    ]);

    // 2. Fetch all REFUNDS created today for OUTCOME.
    const refunds = await prisma.refund.findMany({
        where: { date: { gte: startOfDay, lte: endOfDay } },
    });

    // 3. Calculate totals.
    const dailyIncome =
      incomePayments.reduce((sum, p) => sum + p.amount, 0) +
      incomeWorkshopPayments.reduce((sum, p) => sum + p.amount, 0);

    const dailyOutcome = refunds.reduce((sum, r) => sum + r.amount, 0);
    
    const netTotal = dailyIncome - dailyOutcome;

    // 4. Upsert the ledger entry for the day.
    await prisma.dailyLedger.upsert({
      where: { date: startOfDay },
      update: {
        income: dailyIncome,
        outcome: dailyOutcome,
        netTotal: netTotal,
      },
      create: {
        date: startOfDay,
        income: dailyIncome,
        outcome: dailyOutcome,
        netTotal: netTotal,
      },
    });

    console.log(`Ledger for ${startOfDay.toISOString().split('T')[0]} generated successfully.`);
    return { success: true, message: "تم إنشاء دفتر الحسابات بنجاح." };
  } catch (err) {
    console.error("Failed to generate daily ledger:", err);
    return { success: false, error: true, message: "فشل في إنشاء دفتر الحسابات." };
  }
};

// =================================================================
// EXCEL EXPORT ACTIONS
// =================================================================

export const exportToExcel = async (
    type: string, 
    options?: { 
        classId?: number; 
        workshopId?: number; 
        dateFrom?: string; 
        dateTo?: string; 
        lessonId?: number 
    }
) => {
  "use server";

  try {
    const workbook = new ExcelJS.Workbook();
    let filename = `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Define columns and fetch data based on the export type
    switch (type) {
      case "students":
        const studentsSheet = workbook.addWorksheet("Students");
        const students = await prisma.student.findMany({
          include: { grade: true, classes: true, parent: true },
          orderBy: { name: 'asc' }
        });
        studentsSheet.columns = [
          { header: "ID", key: "id", width: 30 },
          { header: "First Name", key: "name", width: 20 },
          { header: "Last Name", key: "surname", width: 20 },
          { header: "Username", key: "username", width: 20 },
          { header: "Email", key: "email", width: 30 },
          { header: "Phone", key: "phone", width: 20 },
          { header: "Address", key: "address", width: 40 },
          { header: "Birthday", key: "birthday", width: 15 },
          { header: "Sex", key: "sex", width: 10 },
          { header: "Grade", key: "grade", width: 15 },
          { header: "Classes", key: "classes", width: 30 },
          { header: "Parent Name", key: "parentName", width: 25 },
          { header: "Parent Phone", key: "parentPhone", width: 20 },
        ];
        const studentsData = students.map(s => ({
          id: s.id,
          name: s.name,
          surname: s.surname,
          username: s.username,
          email: s.email,
          phone: s.phone,
          address: s.address,
          birthday: s.birthday.toLocaleDateString(),
          sex: s.sex,
          grade: s.grade.level,
          classes: s.classes.map(c => c.name).join(", "),
          parentName: s.parent ? `${s.parent.name} ${s.parent.surname}` : 'N/A',
          parentPhone: s.parent ? s.parent.phone : 'N/A',
        }));
        studentsSheet.addRows(studentsData);
        studentsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        studentsSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "payments":
        if (!options?.classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الدفع." };
        }
        const classWithPayments = await prisma.class.findUnique({
            where: { id: options.classId },
            include: {
                students: {
                    orderBy: { name: 'asc' },
                    include: {
                        payments: {
                            where: { classId: options.classId },
                            include: { refunds: true },
                            orderBy: { date: 'desc' }
                        }
                    }
                }
            }
        });

        if (!classWithPayments) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }
        
        filename = `${classWithPayments.name.replace(/ /g, "_")}_payments_${new Date().toISOString().split('T')[0]}.xlsx`;
        const paymentSheet = workbook.addWorksheet(`${classWithPayments.name} Payments`);

        paymentSheet.columns = [
            { header: "Student Name", key: "studentName", width: 30 },
            { header: "Payment Date", key: "paymentDate", width: 20 },
            { header: "Amount Paid", key: "amountPaid", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Amount Refunded", key: "amountRefunded", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Net Amount", key: "netAmount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Notes", key: "notes", width: 40 },
        ];

        const paymentExportData: any[] = [];
        classWithPayments.students.forEach(student => {
            if (student.payments.length > 0) {
                student.payments.forEach(payment => {
                    const totalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
                    paymentExportData.push({
                        studentName: `${student.name} ${student.surname}`,
                        paymentDate: payment.date.toLocaleDateString(),
                        amountPaid: payment.amount,
                        amountRefunded: totalRefunded,
                        netAmount: payment.amount - totalRefunded,
                        notes: payment.notes || ''
                    });
                });
            } else {
                // Add a row for students with no payments
                paymentExportData.push({
                    studentName: `${student.name} ${student.surname}`,
                    paymentDate: 'No Payments',
                    amountPaid: 0,
                    amountRefunded: 0,
                    netAmount: 0,
                    notes: ''
                });
            }
        });

        paymentSheet.addRows(paymentExportData);
        paymentSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        paymentSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "attendance":
        // 1. Safely get the filter options from the request
        const { classId, dateFrom, dateTo } = options || {};

        if (!classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الحضور." };
        }

        // 2. Build a robust 'where' clause for the attendance records
        const attendanceWhere: Prisma.AttendanceWhereInput = {
            lesson: { classId: classId },
        };

        // FIXED: Safely construct the date filter to avoid spreading undefined
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (dateFrom) {
            const startDate = new Date(dateFrom);
            startDate.setHours(0, 0, 0, 0);
            dateFilter.gte = startDate;
        }
        if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            dateFilter.lte = endDate;
        }
        if (Object.keys(dateFilter).length > 0) {
            attendanceWhere.date = dateFilter;
        }


        // 3. Fetch all necessary data with the corrected filter
        const classData = await prisma.class.findUnique({
            where: { id: classId },
            include: {
                students: {
                    orderBy: { name: 'asc' },
                    include: {
                        attendances: {
                            where: attendanceWhere, // Apply the robust where clause here
                            include: {
                                lesson: { include: { subject: true } }
                            },
                            orderBy: { date: 'asc' }
                        }
                    }
                }
            }
        });

        if (!classData) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }

        const allRecords = classData.students.flatMap(s => s.attendances);
        const attendanceSheet = workbook.addWorksheet("Attendance Grid");
        filename = `Attendance_${classData.name.replace(/ /g, "_")}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // 4. Create the dynamic column headers from the (now correctly filtered) unique lesson instances
        const lessonInstances: { key: string; header: string; date: Date }[] = [];
        const seenInstances = new Set<string>();
        allRecords.forEach(record => {
            const dateKey = new Date(record.date).toISOString().split('T')[0];
            const instanceKey = `${record.lessonId}-${dateKey}`;
            if (!seenInstances.has(instanceKey)) {
                seenInstances.add(instanceKey);
                lessonInstances.push({
                    key: instanceKey,
                    header: `${record.lesson.subject.name}`, // Base name
                    date: new Date(record.date),
                });
            }
        });

        // Add numbering for subjects that appear more than once on the same day
        const dailySubjectCounts = new Map<string, number>();
        lessonInstances.forEach(inst => {
            const subjectDateKey = `${inst.date.toISOString().split('T')[0]}-${inst.header}`;
            dailySubjectCounts.set(subjectDateKey, (dailySubjectCounts.get(subjectDateKey) || 0) + 1);
        });

        const namingCounter = new Map<string, number>();
        lessonInstances.forEach(inst => {
            const subjectDateKey = `${inst.date.toISOString().split('T')[0]}-${inst.header}`;
            if ((dailySubjectCounts.get(subjectDateKey) || 0) > 1) {
                const count = (namingCounter.get(subjectDateKey) || 0) + 1;
                namingCounter.set(subjectDateKey, count);
                inst.header = `${inst.header} (${count})`;
            }
        });
        
        // Sort columns chronologically
        lessonInstances.sort((a, b) => a.date.getTime() - b.date.getTime());

        // 5. Build the Excel sheet structure
        attendanceSheet.columns = [
            { header: "Student", key: "studentName", width: 30 },
            ...lessonInstances.map(inst => ({
                header: `${inst.header}\n${inst.date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`,
                key: inst.key,
                width: 20
            }))
        ];
        
        // 6. Create the data matrix for each student
        const studentRows = classData.students.map(student => {
            const row: { [key: string]: any } = {
                studentName: `${student.name} ${student.surname}`
            };
            student.attendances.forEach(record => {
                const dateKey = new Date(record.date).toISOString().split('T')[0];
                const instanceKey = `${record.lessonId}-${dateKey}`;
                row[instanceKey] = record.present ? 'Present' : 'Absent';
            });
            return row;
        });

        attendanceSheet.addRows(studentRows);

        // 7. Apply styling
        const headerRow = attendanceSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        
        attendanceSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; // Freeze student column and header

        attendanceSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (colNumber > 1) {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (cell.value === 'Present') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                            cell.font = { color: { argb: 'FF006100' } };
                        } else if (cell.value === 'Absent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                            cell.font = { color: { argb: 'FF9C0006' } };
                        }
                    }
                });
            }
        });

        break;


    case "workshop_details":
        if (!options?.workshopId) {
            return { success: false, error: true, message: "مطلوب معرف الدورة (Workshop ID) لإجراء عملية التصدير." };
        }
        const workshopSheet = workbook.addWorksheet("Workshop Roster");
        const workshopDetails = await prisma.workshop.findUnique({
            where: { id: options.workshopId },
            include: {
                sessions: true,
                participants: {
                    include: {
                        payments: {
                            include: {
                                refunds: true
                            }
                        },
                        attendances: true
                    }
                }
            }
        });

        if (!workshopDetails) {
            return { success: false, error: true, message: "لم يتم العثور على الدورة المطلوبة." };
        }

        filename = `${workshopDetails.title.replace(/ /g, "_")}_roster_${new Date().toISOString().split('T')[0]}.xlsx`;

        workshopSheet.columns = [
            { header: "Participant Name", key: "name", width: 30 },
            { header: "Phone", key: "phone", width: 20 },
            { header: "Email", key: "email", width: 30 },
            { header: "Net Paid", key: "netPaid", width: 15, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Amount Owed", key: "amountOwed", width: 15, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Payment Status", key: "paymentStatus", width: 20 },
            { header: "Sessions Attended", key: "sessionsAttended", width: 20 },
            { header: "Total Sessions", key: "totalSessions", width: 20 },
        ];

        const workshopData = workshopDetails.participants.map(p => {
            const totalPaid = p.payments.reduce((sum, payment) => sum + payment.amount, 0);
            const totalRefunded = p.payments.flatMap(payment => payment.refunds).reduce((sum, refund) => sum + refund.amount, 0);
            const netPaid = totalPaid - totalRefunded;
            const amountOwed = workshopDetails.price - netPaid > 0 ? workshopDetails.price - netPaid : 0;
            const paymentStatus = netPaid >= workshopDetails.price ? 'Paid in Full' : 'Owed';
            const sessionsAttended = p.attendances.filter(a => a.present).length;

            return {
                name: p.name,
                phone: p.phone || 'N/A',
                email: p.email || 'N/A',
                netPaid: netPaid,
                amountOwed: amountOwed,
                paymentStatus: paymentStatus,
                sessionsAttended: sessionsAttended,
                totalSessions: workshopDetails.sessions.length,
            };
        });

        workshopSheet.addRows(workshopData);
        workshopSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        workshopSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800080' } }; // Purple for workshops
        break;

      case "financial_report":
        const startOfRange = new Date(options?.dateFrom || new Date());
        startOfRange.setHours(0, 0, 0, 0);
        const endOfRange = new Date(options?.dateTo || options?.dateFrom || new Date());
        endOfRange.setHours(23, 59, 59, 999);

        const incomeSheet = workbook.addWorksheet("Income");
        const outcomeSheet = workbook.addWorksheet("Outcome (Refunds)");
        const summarySheet = workbook.addWorksheet("Summary");
        
        const incomePayments = await prisma.payment.findMany({ where: { date: { gte: startOfRange, lte: endOfRange }, ...(options?.classId && { classId: options.classId }) }, include: { student: true, class: true } });
        const incomeWorkshopPayments = await prisma.workshopPayment.findMany({ where: { date: { gte: startOfRange, lte: endOfRange }, ...(options?.workshopId && { workshopId: options.workshopId }) }, include: { participant: true, workshop: true } });
        const outcomeRefunds = await prisma.refund.findMany({ where: { date: { gte: startOfRange, lte: endOfRange }, ...(options?.classId && { payment: { classId: options.classId } }), ...(options?.workshopId && { workshopPayment: { workshopId: options.workshopId } }) }, include: { payment: { include: { student: true, class: true } }, workshopPayment: { include: { participant: true, workshop: true } } } });

        // --- Income Sheet ---
        const incomeColumns = [
            { header: "Date", key: "date", width: 20 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 30 },
            { header: "Received From", key: "person", width: 30 },
            { header: "Amount", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Notes", key: "notes", width: 40 },
        ];
        incomeSheet.columns = incomeColumns;
        incomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        incomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        
        const allIncome = [
            ...incomePayments.map(p => ({ date: p.date.toLocaleDateString(), type: 'Class Fee', source: p.class.name, person: `${p.student.name} ${p.student.surname}`, amount: p.amount, notes: p.notes })),
            ...incomeWorkshopPayments.map(p => ({ date: p.date.toLocaleDateString(), type: 'Workshop Fee', source: p.workshop.title, person: p.participant.name, amount: p.amount, notes: p.notes }))
        ];
        incomeSheet.addRows(allIncome);
        const totalIncome = allIncome.reduce((sum, i) => sum + i.amount, 0);
        
        // Add Total row for Income
        incomeSheet.addRow([]); // Spacer
        const incomeTotalRow = incomeSheet.addRow(['', '', '', 'Total Income:', totalIncome]);
        incomeTotalRow.getCell(4).font = { bold: true };
        incomeTotalRow.getCell(5).font = { bold: true, color: { argb: 'FF00B050' } };

        // --- Outcome Sheet ---
        const outcomeColumns = [
            { header: "Date", key: "date", width: 20 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 30 },
            { header: "Refunded To", key: "person", width: 30 },
            { header: "Amount", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Notes", key: "notes", width: 40 },
        ];
        outcomeSheet.columns = outcomeColumns;
        outcomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        outcomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFC00000'} };

        const allOutcomes = outcomeRefunds.map(r => ({
            date: r.date.toLocaleDateString(),
            type: r.paymentId ? 'Class Fee Refund' : 'Workshop Fee Refund',
            source: r.payment?.class.name || r.workshopPayment?.workshop.title,
            person: r.payment?.student ? `${r.payment.student.name} ${r.payment.student.surname}` : r.workshopPayment?.participant.name,
            amount: r.amount,
            notes: r.notes
        }));
        outcomeSheet.addRows(allOutcomes);
        const totalOutcome = allOutcomes.reduce((sum, o) => sum + o.amount, 0);

        // Add Total row for Outcome
        outcomeSheet.addRow([]); // Spacer
        const outcomeTotalRow = outcomeSheet.addRow(['', '', '', 'Total Outcome:', totalOutcome]);
        outcomeTotalRow.getCell(4).font = { bold: true };
        outcomeTotalRow.getCell(5).font = { bold: true, color: { argb: 'FFFF0000' } };

        // --- Summary Sheet ---
        const netTotal = totalIncome - totalOutcome;

        // Add Report Header to Summary
        summarySheet.mergeCells('A1:B1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = `Financial Summary`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // --- UPDATED DATE RANGE LOGIC ---
        
        // Combine all fetched transactions to find the actual date span
        const allTransactions = [...incomePayments, ...incomeWorkshopPayments, ...outcomeRefunds];
        let dateRange = 'All Time';
        const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        
        if (options?.dateFrom && options?.dateTo) {
            // Case 1: A specific date range was provided by the user.
            if (options.dateFrom === options.dateTo) {
                dateRange = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
            } else {
                const from = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                const to = new Date(options.dateTo + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                dateRange = `${from} to ${to}`;
            }
        } else if (allTransactions.length > 0) {
            // Case 2: No date range was provided, so we calculate it from the actual data.
            const allDates = allTransactions.map(t => t.date.getTime());
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));
            
            const from = minDate.toLocaleDateString('fr-DZ', dateOptions);
            const to = maxDate.toLocaleDateString('fr-DZ', dateOptions);
        
            // If the min and max date are the same day, just show one date.
            dateRange = from === to ? from : `${from} to ${to}`;
        } else {
            // Case 3: No date range provided AND no transactions were found.
            dateRange = "No transactions found";
        }
        
        summarySheet.mergeCells('A2:B2');
        const dateCell = summarySheet.getCell('A2');
        dateCell.value = `Date Range: ${dateRange}`;

        dateCell.font = { size: 12, italic: true };
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.addRow({}); // Spacer row

        summarySheet.columns = [ { header: 'Metric', key: 'metric', width: 25 }, { header: 'Amount', key: 'amount', width: 25, style: { numFmt: '"DZD"#,##0.00' } } ];
        const summaryHeaderRow = summarySheet.getRow(4);
        summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summaryHeaderRow.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF44546A'} };

        summarySheet.addRows([
            { metric: 'Total Income', amount: totalIncome },
            { metric: 'Total Outcome (Refunds)', amount: totalOutcome },
            { metric: 'Net Total', amount: netTotal },
        ]);

        const totalIncomeCell = summarySheet.getCell('B5');
        totalIncomeCell.font = { bold: true, color: { argb: 'FF00B050' } }; // Green
        const totalOutcomeCell = summarySheet.getCell('B6');
        totalOutcomeCell.font = { bold: true, color: { argb: totalOutcome > 0 ? 'FFFF0000' : 'FF000000' } }; // Red
        const netTotalCell = summarySheet.getCell('B7');
        netTotalCell.font = { bold: true, size: 12, color: { argb: netTotal >= 0 ? 'FF0070C0' : 'FFFF0000' } }; // Blue or Red
        
        break;


      default:
        return { success: false, error: true, message: "Invalid export type specified." };
    }

    // Generate the Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return the file data as a base64 encoded string for download
    return {
      success: true,
      error: false,
      file: {
        content: Buffer.from(buffer).toString("base64"),
        name: filename,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    };

  } catch (err) {
    console.error("Export Error:", err);
    return { success: false, error: true, message: "Failed to export data." };
  }
};
