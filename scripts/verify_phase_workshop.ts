import prisma from "../src/lib/prisma";
import { getDailyRevenueDashboardData } from "../src/lib/revenue";

async function runVerification() {
  console.log("=== PHASE 8 / WORKSHOP VOUCHER VERIFICATION ===");

  // 1. Confirm Workshop has branchId
  console.log("\n1. Verifying Workshop.branchId column...");
  const workshopCols: any[] = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Workshop' AND column_name = 'branchId'
  `;
  if (workshopCols.length === 0) {
    throw new Error("FAIL: Workshop does not have branchId!");
  }
  console.log("PASS: Workshop has branchId (data_type:", workshopCols[0].data_type, ")");

  // 2. Confirm WorkshopPayment table is retired
  console.log("\n2. Verifying WorkshopPayment table retirement...");
  const tables: any[] = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'WorkshopPayment'
  `;
  if (tables.length > 0) {
    throw new Error("FAIL: WorkshopPayment table still exists in public schema!");
  }
  console.log("PASS: WorkshopPayment table does not exist.");

  // 3. Verify Voucher table has workshopId and nullable classId
  console.log("\n3. Verifying Voucher columns (workshopId & classId)...");
  const voucherCols: any[] = await prisma.$queryRaw`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Voucher' AND column_name IN ('workshopId', 'classId')
  `;
  const classIdCol = voucherCols.find((c: any) => c.column_name === "classId");
  const workshopIdCol = voucherCols.find((c: any) => c.column_name === "workshopId");

  if (!workshopIdCol) throw new Error("FAIL: Voucher does not have workshopId column!");
  if (classIdCol?.is_nullable !== "YES") throw new Error("FAIL: Voucher.classId is not nullable!");
  console.log("PASS: Voucher.workshopId exists and Voucher.classId is nullable.");

  // 4. Test Workshop creation, participant registration with voucher, and payment
  console.log("\n4. Testing Workshop payment via Voucher system...");
  
  // Ensure branch 1 exists
  const branch = await prisma.branch.findFirst({ where: { id: 1 } });
  if (!branch) throw new Error("FAIL: Branch 1 not found!");

  // Create test workshop
  const testWorkshop = await prisma.workshop.create({
    data: {
      title: "ورشة روبوتيك واختبار الدفع",
      description: "ورشة تجريبية لاختبار نظام الوصولات",
      branchId: branch.id,
      guestTeacher: "أستاذ تجريبي",
      totalPrice: 5000,
    },
  });
  console.log("Created test workshop:", testWorkshop.id, testWorkshop.title);

  // Create test student
  const maxG = await prisma.student.aggregate({ _max: { globalNumber: true } });
  const testStudent = await prisma.student.create({
    data: {
      id: `test_stud_${Date.now()}`,
      globalNumber: (maxG._max.globalNumber || 10000) + 1,
      name: "تلميذ تجريبي ورشات",
      registeredBranchId: branch.id,
      phone: "0550112233",
    },
  });
  console.log("Created test student:", testStudent.id, testStudent.name);

  // Register participant
  const participant = await prisma.workshopParticipant.create({
    data: {
      workshopId: testWorkshop.id,
      studentId: testStudent.id,
      status: "OWED",
      totalPaid: 0,
      totalRefunded: 0,
    },
  });
  console.log("Created workshop participant:", participant.id);

  // Ensure VoucherSeries exists
  let series = await prisma.voucherSeries.findFirst({
    where: { issuingBranchId: branch.id, scope: "LOCAL_LEVEL" },
  });
  if (!series) {
    series = await prisma.voucherSeries.create({
      data: {
        issuingBranchId: branch.id,
        scope: "LOCAL_LEVEL",
        currentNumber: 100,
      },
    });
  }

  // Issue Workshop payment voucher (simulate addWorkshopPayment)
  const paymentAmount = 3000;
  const updatedSeries = await prisma.voucherSeries.update({
    where: { id: series.id },
    data: { currentNumber: { increment: 1 } },
  });
  const voucherNumber = updatedSeries.currentNumber;

  const voucher = await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: voucherNumber,
      studentId: testStudent.id,
      workshopId: testWorkshop.id,
      classId: null,
      issuingBranchId: branch.id,
      targetBranchId: branch.id,
      paymentType: "WORKSHOP",
      amount: paymentAmount,
      isPartial: true,
      remainingBalance: 2000,
      issuedBy: "test_verifier",
    },
  });
  console.log("Created WORKSHOP Voucher:", voucher.id, "Number:", voucher.number, "Amount:", voucher.amount);

  // Upsert DailyLedger
  const normalizedToday = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  await prisma.dailyLedger.upsert({
    where: {
      branchId_date_type: {
        branchId: branch.id,
        date: normalizedToday,
        type: "ATELIER_FORMATION",
      },
    },
    create: {
      branchId: branch.id,
      date: normalizedToday,
      type: "ATELIER_FORMATION",
      amount: paymentAmount,
    },
    update: {
      amount: { increment: paymentAmount },
    },
  });

  // Update participant
  await prisma.workshopParticipant.update({
    where: { id: participant.id },
    data: {
      totalPaid: { increment: paymentAmount },
      status: "OWED",
    },
  });

  const allLedger = await prisma.dailyLedger.findMany({});
  console.log("All DailyLedger rows in DB:", allLedger);

  // 5. Verify Revenue Dashboard integration
  console.log("\n5. Verifying Revenue Dashboard integration...");
  const dashboardData = await getDailyRevenueDashboardData({
    branchId: branch.id,
    periodMode: "daily",
  });

  console.log("Dashboard KPIs - Atelier/Formation:", dashboardData.summary.atelierFormation, "Gross:", dashboardData.summary.grossRevenue);
  console.log("Dashboard Timeline:", dashboardData.timeline);
  console.log("Dashboard Recent Entries:", dashboardData.recentLedgerEntries);
  if (dashboardData.summary.atelierFormation < paymentAmount) {
    throw new Error(`FAIL: atelierFormation on revenue dashboard (${dashboardData.summary.atelierFormation}) is less than paymentAmount (${paymentAmount})!`);
  }
  console.log("PASS: Workshop revenue is verified and showing on the revenue dashboard under atelierFormation!");

  // Cleanup test records
  console.log("\n6. Cleaning up test data...");
  await prisma.voucher.delete({ where: { id: voucher.id } });
  await prisma.dailyLedger.update({
    where: {
      branchId_date_type: {
        branchId: branch.id,
        date: normalizedToday,
        type: "ATELIER_FORMATION",
      },
    },
    data: { amount: { decrement: paymentAmount } },
  });
  await prisma.workshopParticipant.delete({ where: { id: participant.id } });
  await prisma.student.delete({ where: { id: testStudent.id } });
  await prisma.workshop.delete({ where: { id: testWorkshop.id } });
  console.log("Cleanup completed.");

  console.log("\nALL VERIFICATIONS PASSED SUCCESSFULLY! 🎉");
}

runVerification().catch(console.error).finally(() => prisma.$disconnect());
