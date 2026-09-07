import { Day, PrismaClient, UserSex, Class, Exam, Workshop } from "@prisma/client";
import { fakerAR as faker } from '@faker-js/faker'; // Use Arabic version of Faker

const prisma = new PrismaClient();

// --- HELPER DATA & FUNCTIONS (ARABIC) ---

const algerianMaleNames = ["محمد", "أحمد", "علي", "ياسين", "كريم", "رابح", "سعيد", "خالد", "حسن", "جمال", "نبيل", "سفيان", "عادل", "سمير", "فريد", "عماد", "أمين", "وليد", "فؤاد", "رياض"];
const algerianFemaleNames = ["هبة", "فاطمة", "أمينة", "خديجة", "زهراء", "نادية", "سميرة", "فتيحة", "ليلى", "ياسمينة", "صوفيا", "لينا", "سارة", "إيمان", "رانيا", "نور", "مريم", "هدى", "وسيلة", "فرح", "شهيناز"];
const algerianSurnames = ["مسعودي", "بن علي", "خليفي", "حميدي", "براهيمي", "سعيدي", "شريف", "حداد", "منصوري", "بوزيد", "عمراني", "سليماني", "قاسم", "زياني", "لونيس", "مكي", "طالب", "قندوز", "بوضياف", "مراح", "بلقاسم"];

const gradeNames = ["تحضيري", "سنة أولى ابتدائي", "سنة ثانية ابتدائي", "سنة ثالثة ابتدائي", "سنة رابعة ابتدائي", "سنة خامسة ابتدائي", "سنة أولى متوسط", "سنة ثانية متوسط", "سنة ثالثة متوسط", "شهادة التعليم المتوسط", "سنة أولى ثانوي", "سنة ثانية ثانوي", "بكالوريا", "جامعي"];
const subjectNames = ["رياضيات", "علوم طبيعية", "فيزياء", "لغة عربية", "لغة فرنسية", "لغة إنجليزية", "تاريخ", "جغرافيا", "فلسفة", "تربية إسلامية"];
const daysOfWeek: Day[] = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const possiblePrices = [2000, 2500, 3000, 3500, 4000, 4500, 5000];
const BATCH_SIZE = 10;

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function processInBatches<T, U>(items: T[], processItem: (item: T) => Promise<U>): Promise<U[]> {
    const results: U[] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(processItem));
        results.push(...batchResults);
        console.log(`Processed batch ${Math.ceil((i + 1) / BATCH_SIZE)} of ${Math.ceil(items.length / BATCH_SIZE)}`);
    }
    return results;
}

// --- MAIN SEEDING FUNCTION ---

async function main() {
  console.log("🚀 Starting the comprehensive ARABIC seeding process...");

  // --- Phase 1: Clear old data ---
  console.log("🧹 Clearing old data...");
  await prisma.refund.deleteMany({});
  await prisma.result.deleteMany({});
  await prisma.workshopAttendance.deleteMany({});
  await prisma.workshopPayment.deleteMany({});
  await prisma.workshopParticipant.deleteMany({});
  await prisma.workshopSession.deleteMany({});
  await prisma.workshop.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.lesson.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.courseFile.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.announcement.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.teacher.deleteMany({});
  await prisma.class.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.classroom.deleteMany({});
  console.log("✅ Old data cleared.");

  // --- Phase 2: Create foundational data ---
  console.log("🏛️ Creating Grades, Subjects, and Classrooms (in Arabic)...");
  const grades = await Promise.all(
    gradeNames.map((name) => prisma.grade.create({ data: { level: name } }))
  );
  const subjects = await Promise.all(
    subjectNames.map(name => prisma.subject.create({ data: { name } }))
  );
  const classrooms = await Promise.all(
    Array.from({ length: 20 }, (_, i) => prisma.classroom.create({ data: { name: `قاعة ${101 + i}` } }))
  );
  console.log("✅ Foundational data created.");

  // --- Phase 3: Create Users (Teachers & Parents) ---
  console.log("👥 Creating 50 Teachers and 500 Parents in batches...");
  const teacherData = Array.from({ length: 50 }, (_, i) => i);
  const teachers = await processInBatches(teacherData, async (i) => {
    const sex = getRandomElement([UserSex.MALE, UserSex.FEMALE]);
    const name = sex === UserSex.MALE ? getRandomElement(algerianMaleNames) : getRandomElement(algerianFemaleNames);
    const surname = getRandomElement(algerianSurnames);
    const username = `${faker.internet.userName({ firstName: name, lastName: surname }).toLowerCase().replace(/[^a-z0-9]/g, '')}${i}`;
    const assignedSubjects = faker.helpers.arrayElements(subjects, getRandomNumber(1, 3));

    return prisma.teacher.create({
      data: {
        id: `teacher_${i + 1}`, username, name, surname,
        email: `${username}@wssm.com`,
        phone: `0${getRandomNumber(5, 7)}${getRandomNumber(10000000, 99999999)}`,
        address: "قسنطينة, الجزائر", sex,
        birthday: faker.date.birthdate({ min: 1970, max: 1995, mode: 'year' }),
        subjects: { connect: assignedSubjects.map(s => ({ id: s.id })) }
      }
    });
  });

  const parentData = Array.from({ length: 500 }, (_, i) => i);
  const parents = await processInBatches(parentData, async (i) => {
    const sex = getRandomElement([UserSex.MALE, UserSex.FEMALE]);
    const name = sex === UserSex.MALE ? getRandomElement(algerianMaleNames) : getRandomElement(algerianFemaleNames);
    const surname = getRandomElement(algerianSurnames);
    const username = `${faker.internet.userName({ firstName: name, lastName: surname }).toLowerCase().replace(/[^a-z0-9]/g, '')}${i}`;
    return prisma.parent.create({
      data: {
        id: `parent_${i + 1}`, username, name, surname,
        email: `${username}@wssm.com`,
        phone: `0${getRandomNumber(5, 7)}${getRandomNumber(10000000, 99999999)}`,
        address: "قسنطينة, الجزائر",
      }
    });
  });
  console.log("✅ Teachers and Parents created.");

  // --- Phase 4: Create Classes and Assign Teachers ---
  console.log("🏫 Creating Classes and assigning teachers...");
  const classes: Class[] = [];
  for (const grade of grades) {
    const numClassesPerGrade = getRandomNumber(4, 6);
    for (let i = 0; i < numClassesPerGrade; i++) {
      const capacity = getRandomNumber(15, 30);
      const price = getRandomElement(possiblePrices);
      const classItem = await prisma.class.create({
        data: {
          name: `${grade.level} - فوج ${String.fromCharCode(65 + i)}`,
          capacity, price,
          gradeId: grade.id,
          supervisorId: getRandomElement(teachers).id,
          teachers: { connect: faker.helpers.arrayElements(teachers, getRandomNumber(3, 5)).map(t => ({ id: t.id })) }
        }
      });
      classes.push(classItem);
    }
  }
  console.log(`✅ ${classes.length} Classes created.`);

  // --- Phase 5: Create Students and Enroll Them ---
  console.log("🧑‍🎓 Creating 1000 Students and enrolling them in batches...");
  const studentData = Array.from({ length: 1000 }, (_, i) => i);
  const students = await processInBatches(studentData, async (i) => {
    const sex = getRandomElement([UserSex.MALE, UserSex.FEMALE]);
    const name = sex === UserSex.MALE ? getRandomElement(algerianMaleNames) : getRandomElement(algerianFemaleNames);
    const surname = getRandomElement(algerianSurnames);
    const username = `${faker.internet.userName({ firstName: name, lastName: surname }).toLowerCase().replace(/[^a-z0-9]/g, '')}${i}`;
    
    const grade = getRandomElement(grades);
    const availableClassesInGrade = classes.filter(c => c.gradeId === grade.id);
    const assignedClasses = faker.helpers.arrayElements(availableClassesInGrade, getRandomNumber(1, Math.min(3, availableClassesInGrade.length)));
    
    const parentId = Math.random() < 0.8 ? getRandomElement(parents).id : null;

    return prisma.student.create({
      data: {
        id: `student_${i + 1}`, username, name, surname,
        email: `${username}@wssm.com`,
        phone: `0${getRandomNumber(5, 7)}${getRandomNumber(10000000, 99999999)}`,
        address: "قسنطينة, الجزائر", sex,
        birthday: faker.date.birthdate({ min: 2005, max: 2018, mode: 'year' }),
        gradeId: grade.id, parentId,
        classes: { connect: assignedClasses.map(c => ({ id: c.id })) },
      }
    });
  });
  console.log("✅ Students created and enrolled.");

  // --- Phase 6: Generate Timetable (Lessons) ---
  console.log("🗓️ Generating conflict-free Timetable...");
  const scheduleBookings = new Map<string, boolean>();
  for (const cls of classes) {
    const classTeachers = await prisma.teacher.findMany({ where: { classes: { some: { id: cls.id } } }, include: { subjects: true } });
    if (classTeachers.length === 0) continue;

    for (const day of daysOfWeek) {
        const lessonsPerDay = getRandomNumber(4, 6);
        for (let i = 0; i < lessonsPerDay; i++) {
            let lessonCreated = false;
            let attempts = 0;
            while (!lessonCreated && attempts < 20) {
                const hour = getRandomNumber(8, 16);
                const classroom = getRandomElement(classrooms);
                const teacher = getRandomElement(classTeachers);
                const subject = getRandomElement(teacher.subjects);

                if (subject) {
                    const teacherBookingKey = `${day}-${hour}-${teacher.id}`;
                    const classBookingKey = `${day}-${hour}-${cls.id}`;
                    const classroomBookingKey = `${day}-${hour}-${classroom.id}`;

                    if (!scheduleBookings.has(teacherBookingKey) && !scheduleBookings.has(classBookingKey) && !scheduleBookings.has(classroomBookingKey)) {
                        await prisma.lesson.create({
                            data: {
                                name: `حصة ${subject.name}`, day,
                                startTime: new Date(2000, 0, 1, hour, 0),
                                endTime: new Date(2000, 0, 1, hour + 1, 30),
                                subjectId: subject.id, classId: cls.id, teacherId: teacher.id, classroomId: classroom.id,
                            }
                        });
                        scheduleBookings.set(teacherBookingKey, true);
                        scheduleBookings.set(classBookingKey, true);
                        scheduleBookings.set(classroomBookingKey, true);
                        lessonCreated = true;
                    }
                }
                attempts++;
            }
        }
    }
  }
  console.log("✅ Timetable generated.");

  // --- Phase 7: Generate Historical Data (Past Month) ---
  console.log("📊 Preparing historical Attendance and Payments data...");
  const attendanceData: any[] = [];
  const paymentData: any[] = [];
  const today = new Date();

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const date = new Date();
      date.setDate(today.getDate() - dayOffset);
      const dayOfWeek = daysOfWeek[date.getDay()];
      
      const lessonsOnThisDay = await prisma.lesson.findMany({ where: { day: dayOfWeek } });
      
      for (const lesson of lessonsOnThisDay) {
          const studentsInClass = await prisma.student.findMany({ where: { classes: { some: { id: lesson.classId } } } });
          for (const student of studentsInClass) {
              attendanceData.push({
                  date,
                  present: Math.random() < 0.95,
                  studentId: student.id,
                  lessonId: lesson.id
              });
          }
      }
  }

  for (const student of students) {
      const studentClasses = await prisma.class.findMany({ where: { students: { some: { id: student.id } } } });
      for (const cls of studentClasses) {
          const numPayments = getRandomNumber(1, 2);
          for (let i = 0; i < numPayments; i++) {
              paymentData.push({
                  amount: cls.price,
                  date: faker.date.recent({ days: 30 }),
                  studentId: student.id,
                  classId: cls.id
              });
          }
      }
  }

  console.log(`📝 Inserting ${attendanceData.length} attendance records...`);
  await prisma.attendance.createMany({ data: attendanceData, skipDuplicates: true });
  console.log(`💰 Inserting ${paymentData.length} payment records...`);
  await prisma.payment.createMany({ data: paymentData, skipDuplicates: true });
  console.log("✅ Historical data generated.");


  // --- Phase 8: Create Exams and Results ---
  console.log("✍️ Creating Exams and Results...");
  const exams: Exam[] = [];
  for (let i = 0; i < 30; i++) {
    const cls = getRandomElement(classes);
    const teacher = getRandomElement(await prisma.teacher.findMany({ where: { classes: { some: { id: cls.id } } }, include: { subjects: true } }));
    const subject = getRandomElement(teacher.subjects);
    if (subject) {
        const exam = await prisma.exam.create({
            data: {
                title: `امتحان ${subject.name}`,
                startTime: faker.date.past({ years: 0.1 }),
                endTime: faker.date.future({ years: 0.1 }),
                subjectId: subject.id, classId: cls.id, teacherId: teacher.id, classroomId: getRandomElement(classrooms).id,
            }
        });
        exams.push(exam);
    }
  }

  const resultData: any[] = [];
  for (const exam of exams) {
    const studentsInClass = await prisma.student.findMany({ where: { classes: { some: { id: exam.classId } } } });
    for (const student of studentsInClass) {
        resultData.push({
            score: Math.round(getRandomNumber(0, 20) / 0.25) * 0.25,
            examId: exam.id,
            studentId: student.id,
        });
    }
  }
  console.log(`📝 Inserting ${resultData.length} result records...`);
  await prisma.result.createMany({ data: resultData, skipDuplicates: true });
  console.log("✅ Exams and Results created.");

  // --- Phase 9: Create Activities ---
  console.log("🎉 Creating Announcements, Events, Courses, and Workshops...");
  for (let i = 0; i < 20; i++) {
      await prisma.announcement.create({
          data: {
              title: faker.lorem.sentence(), description: faker.lorem.paragraph(),
              isPinned: Math.random() > 0.8,
              classes: Math.random() > 0.5 ? { connect: { id: getRandomElement(classes).id } } : {}
          }
      });
  }
  for (let i = 0; i < 15; i++) {
    await prisma.event.create({
        data: {
            title: faker.company.catchPhrase(), description: faker.lorem.sentence(),
            startTime: faker.date.soon({ days: 30 }), endTime: faker.date.soon({ days: 30 }),
            classes: Math.random() > 0.5 ? { connect: { id: getRandomElement(classes).id } } : {}
        }
    });
  }
  for (let i = 0; i < 15; i++) {
    await prisma.course.create({
        data: {
            title: `دورة متقدمة في ${getRandomElement(subjects).name}`,
            description: faker.lorem.paragraph(),
            subjectId: getRandomElement(subjects).id,
            teacherId: getRandomElement(teachers).id,
        }
    });
  }
  const workshops: Workshop[] = [];
  for (let i = 0; i < 10; i++) {
    const workshop = await prisma.workshop.create({
        data: {
            title: faker.company.buzzPhrase(), description: faker.lorem.sentence(),
            price: getRandomElement(possiblePrices),
            teacherName: `${getRandomElement(algerianMaleNames)} ${getRandomElement(algerianSurnames)}`,
            sessions: { create: [{ startTime: faker.date.soon({days: 7}), endTime: faker.date.soon({days: 8}) }, { startTime: faker.date.soon({days: 14}), endTime: faker.date.soon({days: 15}) }] }
        }
    });
    workshops.push(workshop);
  }
  console.log("✅ Activities created.");

  // --- Phase 10: Populate Workshops ---
  console.log("🧑‍🎨 Populating Workshops with Participants, Payments, and Attendance...");
  for (const workshop of workshops) {
    const participantCount = getRandomNumber(10, 25);
    const participants = await processInBatches(Array.from({ length: participantCount }), async () => {
        const name = `${getRandomElement(algerianMaleNames)} ${getRandomElement(algerianSurnames)}`;
        return prisma.workshopParticipant.create({
            data: {
                name,
                phone: `0${getRandomNumber(5, 7)}${getRandomNumber(10000000, 99999999)}`,
                email: `${name.replace(' ', '.').toLowerCase()}@wssm.com`,
                workshopId: workshop.id,
            }
        });
    });

    const sessions = await prisma.workshopSession.findMany({ where: { workshopId: workshop.id } });
    const workshopPaymentData: any[] = [];
    const workshopAttendanceData: any[] = [];

    for (const participant of participants) {
        workshopPaymentData.push({
            amount: workshop.price,
            date: faker.date.recent({ days: 15 }),
            participantId: participant.id,
            workshopId: workshop.id,
        });
        for (const session of sessions) {
            workshopAttendanceData.push({
                present: Math.random() < 0.9,
                date: session.startTime,
                participantId: participant.id,
                sessionId: session.id,
            });
        }
    }
    await prisma.workshopPayment.createMany({ data: workshopPaymentData, skipDuplicates: true });
    await prisma.workshopAttendance.createMany({ data: workshopAttendanceData, skipDuplicates: true });
  }
  console.log("✅ Workshops populated.");

  console.log("Seeding completed successfully! 🌱");
}

main()
  .catch((e) => {
    console.error("An error occurred during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
