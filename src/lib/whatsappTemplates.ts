/**
 * Default WhatsApp Message Templates & Dynamic Variable Formatter
 * Supports bilingual Arabic and French communication.
 */

export const DEFAULT_TEMPLATES = {
  // 1. Absence Alert
  absenceAr: `السلام عليكم ورحمة الله وبركاته.
نحيطكم علماً بغياب التلميذ(ة): *{student_name}* (رقم القيد: {global_number}) عن حصة مادة *{class_name}* (الأستاذ: *{teacher_name}*) المقررة اليوم *{date}* على الساعة *{start_time}* بمقر المؤسسة (*{branch_name}*).
يرجى التواصل مع إدارة الفرع لتبرير الغياب أو الرد على هذه الرسالة. شكراً لتعاونكم.
— *مؤسسة ماسينيسا التعليمية*`,

  absenceFr: `Bonjour,
Nous vous informons de l'absence de l'élève *{student_name}* (Matricule : {global_number}) au cours de *{class_name}* (Enseignant : *{teacher_name}*) prévu aujourd'hui *{date}* à *{start_time}* au siège *{branch_name}*.
Merci de contacter l'administration ou de répondre à ce message pour justifier cette absence.
— *École Massinissa*`,

  // 1b. Absence Correction (Late arrival or mistake reversal)
  absenceCorrectedAr: `✅ *تأكيد حضور وتصحيح تسجيل*
السلام عليكم ورحمة الله وبركاته.
نحيطكم علماً بأن التلميذ(ة): *{student_name}* قد التحق(ت) بحصته(ا) في مادة *{class_name}* وهو حاضر(ة) الآن داخل القسم.
تم تصحيح حالة الحضور في النظام المدرسي. نعتذر عن الإشعار السابق الناتج عن تسجيل أولي.
— *مؤسسة ماسينيسا التعليمية*`,

  // 2a. Instant Zero-Credit Alert (After lesson/scan)
  creditZeroAr: `السلام عليكم ورحمة الله وبركاته.
نلفت انتباهكم الكريمة إلى أن رصيد حصص التلميذ(ة): *{student_name}* (رقم القيد: {global_number}) في فوج *{class_name}* قد استُنفد بالكامل (*0 حصص متبقية*).
لضمان استمرار حضور التلميذ(ة) في الحصص القادمة دون انقطاع، يُرجى التقدم لتسديد اشتراك الدورة الجديدة لدى مكتب الاستقبال بفرع *{branch_name}*.
— *مؤسسة ماسينيسا التعليمية*`,

  creditZeroFr: `Bonjour,
Nous vous informons que le solde de séances de l'élève *{student_name}* (Matricule : {global_number}) pour le groupe *{class_name}* est désormais épuisé (*0 séance restante*).
Afin d'assurer la continuité de ses cours sans interruption, nous vous prions de bien vouloir renouveler son abonnement auprès de l'administration du siège *{branch_name}*.
— *École Massinissa*`,

  // 2b. 24-Hour Pre-Lesson Reminder (-1 Debt Warning)
  preLesson24hAr: `⚠️ *تنبيه هام بشأن حصة الغد وتجديد الاشتراك*
السلام عليكم ورحمة الله وبركاته.
نود تذكيركم بأن التلميذ(ة): *{student_name}* (فوج: *{class_name}*) لديه(ا) حصة مبرمجة يوم غد *{date}* على الساعة *{start_time}* بمقر *{branch_name}*.
نلفت انتباهكم الكريمة إلى أن *رصيد الحصص المتبقية حالياً هو: (0 حصص)*.
🔴 *ملاحظة هامة:* في حال حضور التلميذ(ة) لحصة الغد دون تسوية الاشتراك، سيصبح الرصيد سالباً *(-1 حصة في ذمة الولي)*.
لتفادي أي إحراج للتلميذ أو تعليق لحضوره، يُرجى تزويده بمبلغ الاشتراك لتسديده لدى مكتب الاستقبال قبل الدخول إلى القاعة. شكراً لتفهمكم وحرصكم الدائم.
— *إدارة مؤسسة ماسينيسا التعليمية*`,

  preLesson24hFr: `⚠️ *Rappel important : Séance de demain et renouvellement*
Bonjour,
Nous vous rappelons que l'élève *{student_name}* (Groupe : *{class_name}*) a une séance programmée demain *{date}* à *{start_time}* au siège *{branch_name}*.
Le solde actuel de l'élève est de *0 séance restante*.
🔴 *Remarque importante :* En cas de présence sans règlement, le solde basculera en négatif *(-1 séance)*.
Afin d'éviter toute interruption, merci de bien vouloir régulariser le paiement auprès de l'administration avant le début du cours.
— *Administration École Massinissa*`,

  // 3a. New Special Lesson Announcement
  specialLessonNewAr: `📢 *إعلان عن {lesson_type} جديدة*
السلام عليكم ورحمة الله وبركاته.
ننهي إلى علم تلاميذ وأولياء فوج: *{class_name}* عن برمجة *{lesson_type}* مع الأستاذ: *{teacher_name}*:
📅 *التاريخ:* {date}
⏰ *التوقيت:* من {start_time} إلى {end_time}
📍 *المكان:* {classroom_name} — فرع {branch_name}
حضور التلميذ(ة) *{student_name}* هام ومؤكد. بالتوفيق والنجاح.
— *مؤسسة ماسينيسا التعليمية*`,

  // 3b. Special Lesson Rescheduled / Update Confirmation Notice
  specialLessonUpdAr: `⚠️ *تنبيه هام ومؤكد: تعديل موعد الحصة الإضافية*
السلام عليكم ورحمة الله وبركاته.
ننهي إلى علم تلاميذ وأولياء فوج: *{class_name}* (الأستاذ: *{teacher_name}*) أنه *قد تم رسمياً تعديل موعد الحصة المعلن عنها سابقاً*:
❌ *الموعد السابق الملغى:* {old_date} على الساعة {old_start_time}
🟢 *الموعد الجديد والمؤكد رسمياً:* *{new_date}* من الساعة *{new_start_time}* إلى *{new_end_time}*
📍 *المكان المؤكد:* {classroom_name} — فرع {branch_name}
نرجو منكم اعتماد هذا الموعد المؤكد حصراً وإلغاء أي موعد سابق. نتمنى لأبنائنا دوام التوفيق.
— *إدارة مؤسسة ماسينيسا التعليمية*`,

  // 3c. Special Lesson Cancellation Notice
  specialLessonCanAr: `❌ *إلغاء حصة مبرمجة*
السلام عليكم ورحمة الله وبركاته.
نحيطكم علماً بأنه قد تقرر *إلغاء* {lesson_type} لفوج: *{class_name}* (الأستاذ: *{teacher_name}*) التي كانت مقررة يوم *{date}* على الساعة *{start_time}*.
يرجى عدم تنقل التلميذ(ة) *{student_name}* إلى المؤسسة في هذا الموعد. سنوافيكم بأي موعد بديل لاحقاً.
— *إدارة مؤسسة ماسينيسا التعليمية*`,
};

export interface TemplateVariables {
  student_name?: string;
  global_number?: number | string;
  class_name?: string;
  teacher_name?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  classroom_name?: string;
  branch_name?: string;
  lesson_type?: string;
  old_date?: string;
  old_start_time?: string;
  new_date?: string;
  new_start_time?: string;
  new_end_time?: string;
  remaining_credits?: number | string;
}

/**
 * Replaces placeholders in the format {variable_name} with actual context values.
 */
export function formatWhatsAppMessage(template: string, variables: TemplateVariables): string {
  let result = template;
  for (const [key, val] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    result = result.replace(regex, String(val ?? ""));
  }
  return result.trim();
}
