import prisma from "../src/lib/prisma";
import { lessonSchema } from "../src/lib/formValidationSchemas";
import { createLesson, updateLesson } from "../src/lib/actions";

async function runSection75Verification() {
  console.log("=== STARTING ARCHITECTURE §7.5 AUTOMATED VERIFICATION ===");

  // Setup test branch 1 and branch 2
  const branch1 = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "CENTRAL_BRANCH_TEST", address: "Central" },
  });

  const branch2 = await prisma.branch.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: "ANNEX_BRANCH_TEST", address: "Annex" },
  });

  // Setup test teacher
  const testTeacherId = "teacher_test_75";
  await prisma.teacher.upsert({
    where: { id: testTeacherId },
    update: { name: "Prof. Test 7.5" },
    create: { id: testTeacherId, name: "Prof. Test 7.5" },
  });

  // Setup test classrooms in branch 1 and branch 2
  const roomBranch1 = await prisma.classroom.create({
    data: { name: `Salle 101 B1 Test ${Date.now()}`, branchId: 1 },
  });

  const roomBranch2 = await prisma.classroom.create({
    data: { name: `Salle 201 B2 Test ${Date.now()}`, branchId: 2 },
  });

  // Setup test class with head teacher
  let testClass = await prisma.class.findFirst({ where: { teacherId: testTeacherId } });
  if (!testClass) {
    testClass = await prisma.class.create({
      data: {
        name: "Math BAC Test",
        branchId: 1,
        teacherId: testTeacherId,
        inscriptionFee: 1500,
      },
    });
  }

  // Clean old test lessons
  await prisma.attendance.deleteMany({
    where: { lesson: { teacherId: testTeacherId } },
  });
  await prisma.lesson.deleteMany({
    where: { teacherId: testTeacherId },
  });

  console.log("✓ Test fixtures ready.");

  // =========================================================================
  // TEST 1: Schema Single Lesson Type Validation
  // =========================================================================
  console.log("\n--- TEST 1: Single Lesson Type Validation ---");

  // Valid: normal lesson (all false)
  const validNormal = lessonSchema.safeParse({
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: false,
    isCatchUp: false,
    isFree: false,
  });
  if (!validNormal.success) throw new Error("Expected valid normal lesson to pass schema");

  // Valid: extra lesson (only isExtra true)
  const validExtra = lessonSchema.safeParse({
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: true,
    isCatchUp: false,
    isFree: false,
  });
  if (!validExtra.success) throw new Error("Expected valid extra lesson to pass schema");

  // Invalid: multiple flags set (isExtra and isCatchUp)
  const invalidMultiple = lessonSchema.safeParse({
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: true,
    isCatchUp: true,
    isFree: false,
  });
  if (invalidMultiple.success) throw new Error("Schema should have rejected lesson with multiple type flags set!");
  console.log("✓ Schema correctly rejected lesson with multiple type flags set.");

  // Server action validation test for multiple flags
  const serverMultiple = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: true,
    isFree: true,
  });
  if (!serverMultiple.error) throw new Error("Server action createLesson should have rejected multiple type flags!");
  console.log("✓ Server action createLesson correctly rejected multiple type flags:", serverMultiple.message);

  // =========================================================================
  // TEST 2: Auto-fetching Head Teacher from Class
  // =========================================================================
  console.log("\n--- TEST 2: Auto-fetch Head Teacher from Class ---");

  // Create a class with NO head teacher
  const classNoTeacher = await prisma.class.create({
    data: {
      name: "Groupe Sans Prof",
      branchId: 1,
      teacherId: null,
      inscriptionFee: 1000,
    },
  });

  const failNoTeacher = await createLesson({} as any, {
    classId: classNoTeacher.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: false,
    isCatchUp: false,
    isFree: false,
  });
  if (!failNoTeacher.error || !failNoTeacher.message.includes("أستاذ رئيسي")) {
    throw new Error("Expected failure when class has no head teacher");
  }
  console.log("✓ Server action correctly caught class without assigned head teacher:", failNoTeacher.message);

  // Clean up temporary class
  await prisma.class.delete({ where: { id: classNoTeacher.id } });

  // Create a lesson for testClass WITHOUT providing teacherId in the request
  // (Server must auto-fetch teacherId from testClass.teacherId)
  const createAutoTeacher = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: false,
    isCatchUp: false,
    isFree: false,
  });
  if (!createAutoTeacher.success) {
    throw new Error(`Failed to create lesson with auto-fetched teacher: ${createAutoTeacher.message}`);
  }

  const createdLesson = await prisma.lesson.findFirst({
    where: { classId: testClass.id, teacherId: testTeacherId },
  });
  if (!createdLesson) throw new Error("Lesson was not created with the expected auto-fetched teacherId!");
  console.log("✓ Lesson created successfully with auto-fetched teacherId:", createdLesson.teacherId);

  // =========================================================================
  // TEST 3: Time-Conflict Detection (Overlapping-but-offset ranges)
  // =========================================================================
  console.log("\n--- TEST 3: Time-Conflict Detection (Full range comparison) ---");

  // Existing lesson: MONDAY 09:00 - 11:00 (Room: roomBranch1, Teacher: testTeacherId, Class: testClass)

  // Scenario 3A: Overlapping-but-offset (10:00 - 12:00) -> starts inside existing, ends after
  const conflictOffset1 = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "10:00",
    endTime: "12:00",
    isExtra: false,
  });
  if (!conflictOffset1.error) throw new Error("Failed to detect conflict for 10:00-12:00 overlapping 09:00-11:00!");
  console.log("✓ Overlapping-but-offset (10:00-12:00) correctly flagged:", conflictOffset1.message);

  // Scenario 3B: Overlapping-but-offset (08:00 - 10:00) -> starts before existing, ends inside
  const conflictOffset2 = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "08:00",
    endTime: "10:00",
    isExtra: false,
  });
  if (!conflictOffset2.error) throw new Error("Failed to detect conflict for 08:00-10:00 overlapping 09:00-11:00!");
  console.log("✓ Overlapping-but-offset (08:00-10:00) correctly flagged:", conflictOffset2.message);

  // Scenario 3C: Contained within existing (09:30 - 10:30)
  const conflictContained = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "09:30",
    endTime: "10:30",
    isExtra: false,
  });
  if (!conflictContained.error) throw new Error("Failed to detect conflict for 09:30-10:30 contained inside 09:00-11:00!");
  console.log("✓ Contained interval (09:30-10:30) correctly flagged:", conflictContained.message);

  // Scenario 3D: Completely enclosing existing (08:00 - 12:00)
  const conflictEnclosing = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "08:00",
    endTime: "12:00",
    isExtra: false,
  });
  if (!conflictEnclosing.error) throw new Error("Failed to detect conflict for 08:00-12:00 enclosing 09:00-11:00!");
  console.log("✓ Enclosing interval (08:00-12:00) correctly flagged:", conflictEnclosing.message);

  // Scenario 3E: Exact adjacent / consecutive slots (07:00 - 09:00 and 11:00 - 13:00) -> Must be ALLOWED
  const adjacentBefore = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "07:00",
    endTime: "09:00",
    isExtra: false,
  });
  if (!adjacentBefore.success) throw new Error(`Adjacent slot (07:00-09:00) should have been allowed but failed: ${adjacentBefore.message}`);
  console.log("✓ Back-to-back consecutive slot before (07:00-09:00) successfully allowed.");

  const adjacentAfter = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "MONDAY",
    startTime: "11:00",
    endTime: "13:00",
    isExtra: false,
  });
  if (!adjacentAfter.success) throw new Error(`Adjacent slot (11:00-13:00) should have been allowed but failed: ${adjacentAfter.message}`);
  console.log("✓ Back-to-back consecutive slot after (11:00-13:00) successfully allowed.");

  // Scenario 3F: Same time on a different day (TUESDAY 09:00 - 11:00) -> Must be ALLOWED
  const differentDay = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "TUESDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: false,
  });
  if (!differentDay.success) throw new Error(`Same time on different day (TUESDAY 09:00-11:00) should have been allowed: ${differentDay.message}`);
  console.log("✓ Same time on different day (TUESDAY 09:00-11:00) successfully allowed.");

  // =========================================================================
  // TEST 4: Branch Lock & Permissions
  // =========================================================================
  console.log("\n--- TEST 4: Branch Lock & Permissions ---");

  // Simulate Branch Admin at Branch 1
  process.env.TEST_AUTH_ROLE = "branch_admin";
  process.env.TEST_BRANCH_IDS = "1";

  // 4A: Branch admin attempts to schedule at Branch 2 explicitly
  const branchAdminOtherBranch = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    branchId: 2,
    day: "WEDNESDAY",
    startTime: "09:00",
    endTime: "11:00",
  });
  if (!branchAdminOtherBranch.error || !branchAdminOtherBranch.message.includes("فرع آخر")) {
    throw new Error("Branch admin should be blocked from scheduling at branch 2!");
  }
  console.log("✓ Branch admin blocked from specifying another branch:", branchAdminOtherBranch.message);

  // 4B: Branch admin attempts to select a classroom belonging to Branch 2
  const branchAdminOtherRoom = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch2.id,
    day: "WEDNESDAY",
    startTime: "09:00",
    endTime: "11:00",
  });
  if (!branchAdminOtherRoom.error || !branchAdminOtherRoom.message.includes("لا تنتمي إلى فرعك")) {
    throw new Error("Branch admin should be blocked from picking a room from branch 2!");
  }
  console.log("✓ Branch admin blocked from selecting room from another branch:", branchAdminOtherRoom.message);

  // 4C: Branch admin creates a lesson at their own branch (auto-assigned branch 1)
  const branchAdminOwnSuccess = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "WEDNESDAY",
    startTime: "09:00",
    endTime: "11:00",
  });
  if (!branchAdminOwnSuccess.success) {
    throw new Error(`Branch admin failed to schedule at own branch: ${branchAdminOwnSuccess.message}`);
  }
  const adminLesson = await prisma.lesson.findFirst({
    where: { classroomId: roomBranch1.id, teacherId: testTeacherId },
  });
  if (!adminLesson || adminLesson.branchId !== 1) {
    throw new Error("Lesson created by branch admin was not locked to branch 1!");
  }
  console.log("✓ Lesson created by branch admin is automatically locked to branch 1 (branchId: 1).");

  // 4D: Simulate Branch Admin at Branch 2 trying to update Branch 1's lesson
  process.env.TEST_AUTH_ROLE = "branch_admin";
  process.env.TEST_BRANCH_IDS = "2";

  const foreignUpdate = await updateLesson({} as any, {
    id: adminLesson.id,
    classId: testClass.id,
    classroomId: roomBranch1.id,
    day: "WEDNESDAY",
    startTime: "09:00",
    endTime: "11:00",
  });
  if (!foreignUpdate.error || !foreignUpdate.message.includes("لا تنتمي إلى فرعك")) {
    throw new Error("Branch 2 admin should not be able to edit Branch 1's lesson!");
  }
  console.log("✓ Branch admin prevented from modifying lesson of another branch:", foreignUpdate.message);

  // 4E: Simulate Owner (can create and update at any branch)
  process.env.TEST_AUTH_ROLE = "owner";
  process.env.TEST_BRANCH_IDS = "1,2";

  const ownerCreateBranch2 = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: roomBranch2.id,
    branchId: 2,
    day: "THURSDAY",
    startTime: "14:00",
    endTime: "16:00",
  });
  if (!ownerCreateBranch2.success) {
    throw new Error(`Owner should be able to create lesson at Branch 2: ${ownerCreateBranch2.message}`);
  }
  const ownerLesson = await prisma.lesson.findFirst({
    where: { classroomId: roomBranch2.id, teacherId: testTeacherId },
  });
  if (!ownerLesson || ownerLesson.branchId !== 2) {
    throw new Error("Owner's lesson was not scheduled at branch 2 as requested!");
  }
  console.log("✓ Owner successfully scheduled lesson at Branch 2 (branchId: 2).");

  // Clean up created lessons for next test
  await prisma.attendance.deleteMany({
    where: { lesson: { teacherId: testTeacherId } },
  });
  await prisma.lesson.deleteMany({
    where: { teacherId: testTeacherId },
  });

  console.log("\n=== ALL ARCHITECTURE §7.5 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
}

runSection75Verification()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
