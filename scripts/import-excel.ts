/**
 * scripts/import-excel.ts
 * ═══════════════════════════════════════════════════════════════════
 * Batch-imports historical student data from branch Excel files into
 * the school management database.
 *
 * WHAT IT IMPORTS:
 *   - Students (with globalNumber allocation)
 *   - Parent/student phone numbers
 *   - Enrollments (Student ↔ Class)
 *   - Vouchers (INSCRIPTION + TUITION_4SESSION + BOOK + REFUND)
 *   - Refunds (Refund records and refund vouchers linked to cycles)
 *   - VoucherSeries (created / currentNumber updated)
 *
 * USAGE:
 *   npx tsx scripts/import-excel.ts --dry-run     ← preview, no DB writes
 *   npx tsx scripts/import-excel.ts               ← execute
 *   npx tsx scripts/import-excel.ts --file ECOLE.xlsx --dry-run
 *
 * EXCEL FILE STRUCTURE:
 *   - One file per branch, placed in data/import/
 *   - Each sheet = one school level (e.g. "BAC", "1AS", "4AM")
 *   - Each sheet contains multiple group tables
 *   - Group header row (merged cell) = group name
 *   - Column layout (RTL, columns go right→left in source but ExcelJS
 *     reads them left→right in internal index):
 *     Col A: Full Name (merged across 2 stacked rows per student)
 *     Col B: Phone numbers (/ or - separated)
 *     Col C: Inscription fee (top: amount, bottom: voucher)
 *     Col D+: Month 01..12 (top: amount, bottom: voucher)
 *
 *   NOTE: The screenshot shows RTL layout, so in the actual xlsx the
 *   columns may be in reverse order. The script detects the header row
 *   by finding "الاسم واللقب" and maps column indices dynamically.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from 'decimal.js';
import { prisma } from './lib/db';
import { parsePhoneCell } from './lib/parsePhone';
import { parsePaymentCell, ParsedVoucher } from './lib/parseVoucher';

// ── Config ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../data/import');
const ACADEMIC_YEAR_ID = 11;       // 2026-2027
const INSCRIPTION_AMOUNT = 250;    // default inscription fee if cell is empty
const SYSTEM_USER = 'system_import';

/**
 * Map Excel file basename → Branch ID.
 * Filename must contain the branch name (case-insensitive).
 * Adjust to match your actual file names.
 */
const BRANCH_FILE_MAP: Record<string, number> = {
  ECOLE: 1,
  ANNEX: 2,
  AMPHI: 3,
};

// ── Column header keywords (Arabic) ────────────────────────────────
const COL_NAME_KEYWORDS = ['الاسم', 'اللقب'];
const COL_PHONE_KEYWORDS = ['الهاتف', 'هاتف'];
const COL_INSCRIPTION_KEYWORDS = ['التسجيل', 'تسجيل', 'حقوق'];
const COL_MONTH_KEYWORDS = ['شهر', 'الشهر'];
const COL_BOOK_KEYWORDS = ['كتاب', 'كتب', 'كـتاب'];

const TRIMESTER_IDS: Record<1 | 2 | 3, number> = {
  1: 24, // T1
  2: 25, // T2
  3: 26, // T3
};

// ── Types ───────────────────────────────────────────────────────────

interface ColMap {
  nameCol: number;
  phoneCol: number;
  inscriptionCol: number;
  monthCols: number[];  // ordered list of month column indices
  bookCols: Array<{ col: number; trimNum: 1 | 2 | 3 }>;
}

interface ParsedStudent {
  name: string;
  phones: string[];
  inscriptionVouchers: ParsedVoucher[];
  tuitionVouchers: ParsedVoucher[];
  bookVouchers: Array<{ trimNum: 1 | 2 | 3; voucher: ParsedVoucher }>;
  rowIndex: number;
}

interface ParsedGroup {
  groupName: string;      // raw header from Excel
  levelName: string;      // from sheet name
  branchId: number;
  hasBooks: boolean;
  students: ParsedStudent[];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fileFilter = (() => {
    const idx = process.argv.indexOf('--file');
    return idx >= 0 ? process.argv[idx + 1] : null;
  })();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SCHOOL DATA IMPORTER  ${dryRun ? '[DRY RUN — NO DB WRITES]' : '[EXECUTE MODE]'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Ensure data dir exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created ${DATA_DIR} — please place your Excel files there and re-run.`);
    return;
  }

  // Collect Excel files (ignore Excel temp lock files starting with ~$)
  const allFiles = fs.readdirSync(DATA_DIR).filter((f) =>
    /\.(xlsx|xls)$/i.test(f) && !f.startsWith('~$')
  );
  const files = fileFilter
    ? allFiles.filter((f) => f.toLowerCase().includes(fileFilter.toLowerCase()))
    : allFiles;

  if (files.length === 0) {
    console.log(`No Excel files found in ${DATA_DIR}`);
    console.log('Place your branch Excel files there, named to include the branch name:');
    console.log('  ECOLE.xlsx, ANNEX.xlsx, AMPHI.xlsx  (or any name containing the branch name)');
    return;
  }

  // Load reference data from DB
  const [dbClasses, dbLevels, dbFormationLevels, dbStudents] = await Promise.all([
    prisma.class.findMany({
      include: { branch: true, level: true, FormationLevel: { include: { Language: true } } },
    }),
    prisma.level.findMany(),
    prisma.formationLevel.findMany({ include: { Language: true } }),
    prisma.student.findMany({ select: { id: true, name: true, globalNumber: true } }),
  ]);

  const classLookup = buildClassLookup(dbClasses as any);
  const levelByName = new Map(dbLevels.map((l) => [normalizeArabic(l.name), l.id]));
  const formationLevelByName = new Map<string, number>();
  for (const fl of dbFormationLevels) {
    formationLevelByName.set(normalizeArabic(fl.name), fl.id);
    if (fl.Language?.name) {
      formationLevelByName.set(normalizeArabic(`${fl.Language.name} ${fl.name}`), fl.id);
      formationLevelByName.set(normalizeArabic(`${fl.name} ${fl.Language.name}`), fl.id);
      formationLevelByName.set(normalizeArabic(fl.Language.name), fl.id);
    }
  }
  const existingStudentsByName = new Map(
    dbStudents.map((s) => [normalizeArabic(s.name), s])
  );

  // Get next available global number
  let nextGlobalNumber = await getNextGlobalNumber();

  // ── Parse all Excel files ─────────────────────────────────────────
  const allGroups: ParsedGroup[] = [];
  const parseErrors: string[] = [];

  for (const file of files) {
    const branchId = detectBranch(file);
    if (!branchId) {
      parseErrors.push(`Cannot determine branch for file: ${file} — skipping`);
      continue;
    }

    console.log(`\n📄 Parsing: ${file} → Branch ID ${branchId}`);
    const groups = await parseExcelFile(
      path.join(DATA_DIR, file),
      branchId,
      parseErrors
    );
    allGroups.push(...groups);
  }

  // ── Build report ──────────────────────────────────────────────────
  const totalStudentsFound = allGroups.reduce((s, g) => s + g.students.length, 0);
  let totalBookVouchersFound = 0;
  let totalRefundVouchersFound = 0;
  for (const g of allGroups) {
    for (const s of g.students) {
      totalBookVouchersFound += s.bookVouchers.length;
      totalRefundVouchersFound +=
        s.inscriptionVouchers.filter((v) => v.isRefund).length +
        s.tuitionVouchers.filter((v) => v.isRefund).length;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`PARSE SUMMARY`);
  console.log(`  Groups found:         ${allGroups.length}`);
  console.log(`  Students found:       ${totalStudentsFound}`);
  console.log(`  Book payments found:  ${totalBookVouchersFound}`);
  console.log(`  Refunds found:        ${totalRefundVouchersFound}`);
  if (parseErrors.length > 0) {
    console.log(`\n⚠  PARSE WARNINGS (${parseErrors.length}):`);
    parseErrors.forEach((e) => console.log(`   - ${e}`));
  }

  // Check group matching
  const unmatchedGroups: string[] = [];
  for (const g of allGroups) {
    const cls = matchClass(g.groupName, g.levelName, g.branchId, classLookup, levelByName, formationLevelByName);
    if (!cls) {
      unmatchedGroups.push(
        `  [Branch ${g.branchId}] "${g.groupName}" / level "${g.levelName}" → NO MATCH`
      );
    }
  }

  if (unmatchedGroups.length > 0) {
    console.log(`\n⚠  UNMATCHED GROUPS (${unmatchedGroups.length}) — these will be SKIPPED:`);
    unmatchedGroups.forEach((m) => console.log(m));
  }

  // Duplicate student name check
  const nameCount = new Map<string, number>();
  for (const g of allGroups) {
    for (const s of g.students) {
      const k = normalizeArabic(s.name);
      nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
    }
  }
  const duplicates = [...nameCount.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    console.log(`\nℹ  STUDENTS APPEARING IN MULTIPLE GROUPS (${duplicates.length}):`);
    duplicates.slice(0, 20).forEach(([n, c]) => console.log(`   "${n}" × ${c}`));
    if (duplicates.length > 20) console.log(`   … and ${duplicates.length - 20} more`);
  }

  if (dryRun) {
    console.log('\n✅ Dry run complete — no changes made to the database.');
    console.log('   Run without --dry-run to execute the import.\n');
    await prisma.$disconnect();
    return;
  }

  // ── Execute import ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('EXECUTING IMPORT...\n');

  // Cache: normalizedName → DB student id (built as we create students)
  const studentCache = new Map<string, string>(
    [...existingStudentsByName.entries()].map(([k, s]) => [k, s.id])
  );

  // VoucherSeries cache: `branchId-levelId` → series id
  const seriesCache = new Map<string, number>();

  // Track max voucher number per series for final update
  const seriesMaxNumber = new Map<string, number>();

  let createdStudents = 0;
  let createdEnrollments = 0;
  let createdVouchers = 0;
  let createdRefundVouchers = 0;
  let createdRefunds = 0;
  let createdBookVouchers = 0;
  let skippedGroups = 0;

  for (const group of allGroups) {
    const cls = matchClass(group.groupName, group.levelName, group.branchId, classLookup, levelByName, formationLevelByName);
    if (!cls) {
      skippedGroups++;
      continue;
    }

    // Ensure class hasBooks flag is updated if group has books
    if (group.hasBooks && !cls.hasBooks) {
      await prisma.class.update({
        where: { id: cls.id },
        data: { hasBooks: true },
      });
      cls.hasBooks = true;
      console.log(`    📚 Class "${cls.name}" updated → hasBooks = true`);
    }

    console.log(`  → Group: "${group.groupName}" → Class "${cls.name}" (id=${cls.id}, levelId=${cls.levelId})`);

    for (const student of group.students) {
      const nameKey = normalizeArabic(student.name);

      // ── 1. Create or reuse student ──────────────────────────────
      let studentId = studentCache.get(nameKey);
      if (!studentId) {
        studentId = uuidv4();
        const globalNum = nextGlobalNumber++;

        await prisma.$executeRaw`
          INSERT INTO "Student" (id, "globalNumber", name, phone, "registeredBranchId", "createdAt", "payerStatus")
          VALUES (
            ${studentId},
            ${globalNum},
            ${student.name},
            ${student.phones[0] ?? null},
            ${group.branchId},
            NOW(),
            'NORMAL'
          )
        `;
        createdStudents++;
        studentCache.set(nameKey, studentId);

        // ── 2. Parent phone numbers ─────────────────────────────
        for (const phone of student.phones.slice(1)) {
          await prisma.$executeRaw`
            INSERT INTO "ParentPhoneNumber" ("studentId", phone)
            VALUES (${studentId}, ${phone})
          `;
        }
      }

      // ── 3. Enrollment (skip if already enrolled in this class) ──
      const existingEnrollment = await prisma.enrollment.findFirst({
        where: { studentId, classId: cls.id },
      });
      if (!existingEnrollment) {
        await prisma.$executeRaw`
          INSERT INTO "Enrollment" (
            "studentId", "classId", "academicYearId",
            "inscriptionFeeCharged", "enrolledAt", "payerStatus"
          )
          VALUES (${studentId}, ${cls.id}, ${ACADEMIC_YEAR_ID}, true, NOW(), 'NORMAL')
        `;
        createdEnrollments++;
      }

      // ── 4. Vouchers ─────────────────────────────────────────────
      const levelId = cls.levelId ?? null;
      const seriesKey = `${group.branchId}-${levelId ?? 'none'}`;

      // Find or create VoucherSeries
      if (!seriesCache.has(seriesKey)) {
        const seriesId = await findOrCreateSeries(group.branchId, levelId);
        seriesCache.set(seriesKey, seriesId);
      }
      const seriesId = seriesCache.get(seriesKey)!;

      // Inscription vouchers
      for (const v of student.inscriptionVouchers) {
        if (v.isRefund) {
          const refundSeriesKey = `refund-${group.branchId}`;
          if (!seriesCache.has(refundSeriesKey)) {
            const rSeriesId = await findOrCreateRefundSeries(group.branchId);
            seriesCache.set(refundSeriesKey, rSeriesId);
          }
          const refundSeriesId = seriesCache.get(refundSeriesKey)!;
          const rvNumber = getValidVoucherNumber(v.number, refundSeriesKey, seriesMaxNumber);
          const exists = await prisma.voucher.findFirst({
            where: { studentId, classId: cls.id, isRefund: true, number: rvNumber, seriesId: refundSeriesId },
          });
          if (!exists) {
            let orig = await prisma.voucher.findFirst({
              where: { studentId, classId: cls.id, paymentType: 'INSCRIPTION', isRefund: false },
            });
            if (!orig) {
              const origNumber = getValidVoucherNumber(0, seriesKey, seriesMaxNumber);
              orig = (await createVoucher({
                studentId,
                classId: cls.id,
                seriesId,
                number: origNumber,
                amount: v.amount,
                paymentType: 'INSCRIPTION',
                issuingBranchId: group.branchId,
                targetBranchId: cls.branchId,
                issuedAt: v.date,
              })) as any;
              createdVouchers++;
              updateSeriesMax(seriesMaxNumber, seriesKey, origNumber);
            }
            await createVoucher({
              studentId,
              classId: cls.id,
              seriesId: refundSeriesId,
              number: rvNumber,
              amount: v.amount,
              paymentType: 'INSCRIPTION',
              issuingBranchId: group.branchId,
              targetBranchId: cls.branchId,
              issuedAt: v.date,
              isRefund: true,
              refundForVoucherId: orig.id,
              status: 'REFUND',
            });
            createdRefundVouchers++;
            createdVouchers++;
            updateSeriesMax(seriesMaxNumber, refundSeriesKey, rvNumber);

            const existingRefund = await prisma.refund.findFirst({
              where: { voucherId: orig.id, amount: new Decimal(v.amount) },
            });
            if (!existingRefund) {
              await prisma.refund.create({
                data: {
                  voucherId: orig.id,
                  amount: new Decimal(v.amount),
                  reason: `Excel import - RMB BON ${rvNumber}`,
                  refundedBy: SYSTEM_USER,
                  refundedAt: v.date,
                },
              });
              createdRefunds++;
            }
            await prisma.voucher.update({
              where: { id: orig.id },
              data: { remainingBalance: new Decimal(0), status: 'REFUNDED', isVoided: true },
            });
          }
          continue;
        }

        const vNumber = getValidVoucherNumber(v.number, seriesKey, seriesMaxNumber);
        const exists = await prisma.voucher.findFirst({
          where: { studentId, classId: cls.id, paymentType: 'INSCRIPTION', number: vNumber, seriesId },
        });
        if (!exists) {
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId,
            number: vNumber,
            amount: v.amount || INSCRIPTION_AMOUNT,
            paymentType: 'INSCRIPTION',
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: v.date,
          });
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, seriesKey, vNumber);
        }
      }

      // Tuition vouchers
      const tuitionPaymentType = cls.isFormation ? 'FORMATION' : 'TUITION_4SESSION';
      const regularTuitionVouchers = student.tuitionVouchers.filter((v) => !v.isRefund);
      const refundTuitionVouchers = student.tuitionVouchers.filter((v) => v.isRefund);

      // 4a. Process regular tuition vouchers first
      for (const v of regularTuitionVouchers) {
        const vNumber = getValidVoucherNumber(v.number, seriesKey, seriesMaxNumber);
        const exists = await prisma.voucher.findFirst({
          where: { studentId, classId: cls.id, paymentType: tuitionPaymentType, number: vNumber, seriesId },
        });
        if (!exists) {
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId,
            number: vNumber,
            amount: v.amount,
            paymentType: tuitionPaymentType,
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: v.date,
          });
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, seriesKey, vNumber);
        }
      }

      // 4b. Process refund tuition vouchers
      for (const rv of refundTuitionVouchers) {
        const refundSeriesKey = `refund-${group.branchId}`;
        if (!seriesCache.has(refundSeriesKey)) {
          const rSeriesId = await findOrCreateRefundSeries(group.branchId);
          seriesCache.set(refundSeriesKey, rSeriesId);
        }
        const refundSeriesId = seriesCache.get(refundSeriesKey)!;
        const rvNumber = getValidVoucherNumber(rv.number, refundSeriesKey, seriesMaxNumber);

        const existsRefund = await prisma.voucher.findFirst({
          where: {
            studentId,
            classId: cls.id,
            seriesId: refundSeriesId,
            number: rvNumber,
            isRefund: true,
          },
        });

        if (!existsRefund) {
          // Find the original tuition voucher to link this refund to
          let originalVoucher = await prisma.voucher.findFirst({
            where: {
              studentId,
              classId: cls.id,
              isRefund: false,
              status: { in: ['ACTIVE', 'PARTIALLY_REFUNDED'] },
            },
            orderBy: { issuedAt: 'desc' },
            include: { refunds: true },
          });

          if (!originalVoucher) {
            originalVoucher = await prisma.voucher.findFirst({
              where: {
                studentId,
                classId: cls.id,
                isRefund: false,
              },
              orderBy: { issuedAt: 'desc' },
              include: { refunds: true },
            });
          }

          if (!originalVoucher) {
            // Create the underlying tuition voucher that is being refunded
            const origNumber = getValidVoucherNumber(0, seriesKey, seriesMaxNumber);
            originalVoucher = (await createVoucher({
              studentId,
              classId: cls.id,
              seriesId,
              number: origNumber,
              amount: rv.amount,
              paymentType: tuitionPaymentType,
              issuingBranchId: group.branchId,
              targetBranchId: cls.branchId,
              issuedAt: rv.date,
            })) as any;
            createdVouchers++;
            updateSeriesMax(seriesMaxNumber, seriesKey, origNumber);
          }

          // Create the refund voucher
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId: refundSeriesId,
            number: rvNumber,
            amount: rv.amount,
            paymentType: tuitionPaymentType,
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: rv.date,
            isRefund: true,
            refundForVoucherId: originalVoucher.id,
            status: 'REFUND',
          });
          createdRefundVouchers++;
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, refundSeriesKey, rvNumber);

          // Create Refund record for audit & ledger
          const existingRefund = await prisma.refund.findFirst({
            where: {
              voucherId: originalVoucher.id,
              amount: new Decimal(rv.amount),
            },
          });

          if (!existingRefund) {
            await prisma.refund.create({
              data: {
                voucherId: originalVoucher.id,
                amount: new Decimal(rv.amount),
                reason: `Excel import - RMB BON ${rvNumber}`,
                refundedBy: SYSTEM_USER,
                refundedAt: rv.date,
              },
            });
            createdRefunds++;
          }

          // Update original voucher remaining balance and status
          const priorRefunds = originalVoucher.refunds
            ? originalVoucher.refunds.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
            : 0;
          const newTotalRefunded = priorRefunds + rv.amount;
          const origAmount = Number(originalVoucher.amount);
          const newRemaining = Math.max(0, origAmount - newTotalRefunded);
          const isFull = newRemaining <= 0;

          await prisma.voucher.update({
            where: { id: originalVoucher.id },
            data: {
              remainingBalance: new Decimal(newRemaining),
              status: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              isVoided: isFull ? true : originalVoucher.isVoided,
              lastEditedAt: new Date(),
              lastEditedBy: SYSTEM_USER,
            },
          });
        }
      }

      // Book vouchers
      for (const bv of student.bookVouchers) {
        const trimId = TRIMESTER_IDS[bv.trimNum];
        const vNumber = getValidVoucherNumber(bv.voucher.number, seriesKey, seriesMaxNumber);
        const exists = await prisma.voucher.findFirst({
          where: {
            studentId,
            classId: cls.id,
            paymentType: 'BOOK',
            number: vNumber,
            seriesId,
            trimesterId: trimId,
          },
        });
        if (!exists) {
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId,
            number: vNumber,
            amount: bv.voucher.amount,
            paymentType: 'BOOK',
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: bv.voucher.date,
            trimesterId: trimId,
          });
          createdBookVouchers++;
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, seriesKey, vNumber);
        }
      }
    }
  }

  // ── 5. Update VoucherSeries currentNumber ────────────────────────
  console.log('\n  Updating VoucherSeries counters...');
  for (const [key, maxNum] of seriesMaxNumber.entries()) {
    const seriesId = seriesCache.get(key)!;
    await prisma.voucherSeries.update({
      where: { id: seriesId },
      data: { currentNumber: maxNum },
    });
    console.log(`    Series ${seriesId} (${key}): currentNumber → ${maxNum}`);
  }

  // Also ensure any existing vouchers in series have currentNumber >= MAX(number)
  const allDBSumm = await prisma.voucherSeries.findMany({ select: { id: true, currentNumber: true } });
  for (const s of allDBSumm) {
    const agg = await prisma.voucher.aggregate({
      where: { seriesId: s.id },
      _max: { number: true },
    });
    const maxNum = agg._max.number ?? 0;
    if (maxNum > s.currentNumber) {
      await prisma.voucherSeries.update({
        where: { id: s.id },
        data: { currentNumber: maxNum },
      });
    }
  }

  // ── 6. Synchronize DailyLedger from all vouchers ────────────────
  console.log('\n  Synchronizing DailyLedger from vouchers...');
  await syncImportedDailyLedger();

  console.log(`\n${'═'.repeat(60)}`);
  console.log('IMPORT COMPLETE');
  console.log(`  Students created:       ${createdStudents}`);
  console.log(`  Enrollments created:    ${createdEnrollments}`);
  console.log(`  Total vouchers created: ${createdVouchers}`);
  console.log(`    - Refund vouchers:    ${createdRefundVouchers}`);
  console.log(`    - Book vouchers:      ${createdBookVouchers}`);
  console.log(`  Refund records created: ${createdRefunds}`);
  console.log(`  Groups skipped:         ${skippedGroups} (no class match)`);
  console.log(`${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
}

async function syncImportedDailyLedger() {
  const [vouchers, refunds] = await Promise.all([
    prisma.voucher.findMany({
      where: { isVoided: false, isRefund: false },
      include: { class: true },
    }),
    prisma.refund.findMany({
      include: { voucher: true },
    }),
  ]);

  const ledgerMap = new Map<string, { branchId: number; date: Date; type: string; amount: number }>();

  for (const v of vouchers) {
    const amount = Number(v.amount);
    if (amount <= 0) continue;

    const d = new Date(v.issuedAt);
    const normalizedDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const dateKey = normalizedDate.toISOString();

    let type = 'TUITION';
    if (v.class?.isFormation || v.paymentType === 'WORKSHOP') {
      type = 'ATELIER_FORMATION';
    } else if (v.paymentType === 'INSCRIPTION') {
      type = 'INSCRIPTION';
    } else if (v.paymentType === 'BOOK') {
      type = 'BOOK';
    }

    const branchId = v.issuingBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  for (const r of refunds) {
    const amount = Number(r.amount);
    if (amount <= 0) continue;

    const d = new Date(r.refundedAt);
    const normalizedDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const dateKey = normalizedDate.toISOString();
    const type = 'REFUND';
    const branchId = r.voucher.issuingBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  const items = Array.from(ledgerMap.values()).map((item) => ({
    branchId: item.branchId,
    date: item.date,
    type: item.type,
    amount: new Decimal(item.amount).toString() as any,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.dailyLedger.deleteMany({});
    if (items.length > 0) {
      await tx.dailyLedger.createMany({
        data: items,
      });
    }
  });

  console.log(`    Synchronized ${items.length} DailyLedger entries.`);
}

// ── Excel parsing ───────────────────────────────────────────────────

async function parseExcelFile(
  filePath: string,
  branchId: number,
  errors: string[]
): Promise<ParsedGroup[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const groups: ParsedGroup[] = [];

  for (const sheet of workbook.worksheets) {
    const levelName = sheet.name.trim();
    if (levelName.includes('READ ME') || levelName.startsWith('📖') || levelName.toLowerCase().startsWith('read')) {
      continue;
    }
    console.log(`   Sheet: "${levelName}"`);

    const sheetGroups = parseSheet(sheet, levelName, branchId, errors);
    groups.push(...sheetGroups);
  }

  return groups;
}

function parseSheet(
  sheet: ExcelJS.Worksheet,
  levelName: string,
  branchId: number,
  errors: string[]
): ParsedGroup[] {
  const groups: ParsedGroup[] = [];

  // Collect all rows as raw data
  const rows: Array<Array<string | null>> = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: Array<string | null> = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(getCellText(cell));
    });
    rows.push(cells);
  });

  let i = 0;
  while (i < rows.length) {
    // Look for a header row containing "الاسم" keyword
    const headerIdx = findHeaderRow(rows, i);
    if (headerIdx < 0) break;

    // The row just above the header (or the merged group cell) is the group name
    const groupName = findGroupName(rows, headerIdx, i);

    // Map column indices from this header
    const colMap = buildColMap(rows[headerIdx]);
    if (!colMap) {
      errors.push(`Sheet "${levelName}": Could not map columns at row ${headerIdx + 1}`);
      i = headerIdx + 1;
      continue;
    }

    // Parse student rows following the header
    const { students, nextRow } = parseStudentRows(rows, headerIdx + 1, colMap, errors, levelName);

    if (students.length > 0) {
      const hasBooks = colMap.bookCols.length > 0 || students.some((s) => s.bookVouchers.length > 0);
      groups.push({ groupName, levelName, branchId, hasBooks, students });
      console.log(`     Group: "${groupName}" → ${students.length} students${hasBooks ? ' 📚 (hasBooks)' : ''}`);
    }

    i = Math.max(headerIdx + 1, nextRow);
  }

  return groups;
}

function isHeaderRow(row: Array<string | null> | undefined): boolean {
  if (!row) return false;
  const text = row.filter(Boolean).join(' ');
  const hasName = COL_NAME_KEYWORDS.some((kw) => text.includes(kw));
  const hasPhone = COL_PHONE_KEYWORDS.some((kw) => text.includes(kw));
  return hasName && hasPhone;
}

function findHeaderRow(rows: Array<Array<string | null>>, startIdx: number): number {
  for (let i = startIdx; i < rows.length; i++) {
    if (isHeaderRow(rows[i])) {
      return i;
    }
  }
  return -1;
}

function findGroupName(rows: Array<Array<string | null>>, headerIdx: number, minRow: number = 0): string {
  // Search backwards from headerIdx - 1 down to minRow for the merged group name
  for (let j = headerIdx - 1; j >= Math.max(minRow, headerIdx - 5); j--) {
    const nonEmpty = rows[j].filter((c) => c && c.trim().length > 0);
    if (nonEmpty.length > 0) {
      return nonEmpty[0]!.trim();
    }
  }
  return `Group at row ${headerIdx + 1}`;
}

function buildColMap(headerRow: Array<string | null>): ColMap | null {
  let nameCol = -1;
  let phoneCol = -1;
  let inscriptionCol = -1;
  const monthCols: number[] = [];
  const bookCols: Array<{ col: number; trimNum: 1 | 2 | 3 }> = [];

  for (let c = 0; c < headerRow.length; c++) {
    const text = (headerRow[c] ?? '').trim();
    if (nameCol < 0 && COL_NAME_KEYWORDS.some((kw) => text.includes(kw))) {
      nameCol = c;
    } else if (phoneCol < 0 && COL_PHONE_KEYWORDS.some((kw) => text.includes(kw))) {
      phoneCol = c;
    } else if (inscriptionCol < 0 && COL_INSCRIPTION_KEYWORDS.some((kw) => text.includes(kw))) {
      inscriptionCol = c;
    } else if (COL_BOOK_KEYWORDS.some((kw) => text.includes(kw))) {
      let trimNum: 1 | 2 | 3 = 1;
      if (text.includes('3') || text.includes('ت3') || text.includes('ت 3')) trimNum = 3;
      else if (text.includes('2') || text.includes('ت2') || text.includes('ت 2')) trimNum = 2;
      bookCols.push({ col: c, trimNum });
    } else if (COL_MONTH_KEYWORDS.some((kw) => text.includes(kw))) {
      monthCols.push(c);
    }
  }

  if (nameCol < 0) return null;

  return { nameCol, phoneCol, inscriptionCol, monthCols, bookCols };
}

function parseStudentRows(
  rows: Array<Array<string | null>>,
  startIdx: number,
  colMap: ColMap,
  errors: string[],
  sheetName: string
): { students: ParsedStudent[]; nextRow: number } {
  const students: ParsedStudent[] = [];
  let i = startIdx;

  while (i < rows.length) {
    const topRow = rows[i];
    if (!topRow) {
      i++;
      break;
    }

    const bottomRow = rows[i + 1] ?? [];

    // Stop if we hit another header row
    if (isHeaderRow(topRow) || isHeaderRow(bottomRow)) {
      break;
    }

    // Stop if the row right after this one is a header row (meaning topRow is the next group's title)
    if (i + 1 < rows.length && isHeaderRow(rows[i + 1])) {
      break;
    }
    // Or two rows ahead is a header row and topRow is empty/group title
    if (i + 2 < rows.length && isHeaderRow(rows[i + 2])) {
      const rowText = topRow.filter(Boolean).join('').trim();
      if (!rowText || !topRow[colMap.nameCol]) {
        break;
      }
    }

    // Name comes from the top row (merged cell spans both rows)
    const rawName = topRow[colMap.nameCol]?.trim() ?? '';

    // If no name, check if there are further students in this table before the next table header or banner
    if (!rawName) {
      let hasMoreStudents = false;
      for (let scan = i + 1; scan < rows.length; scan++) {
        const scanRow = rows[scan] || [];
        if (isHeaderRow(scanRow)) break;
        if (scan + 1 < rows.length && isHeaderRow(rows[scan + 1])) break;
        if (scan + 2 < rows.length && isHeaderRow(rows[scan + 2])) {
          if (!scanRow[colMap.nameCol]?.trim()) break;
        }
        if (scanRow[colMap.nameCol]?.trim()) {
          hasMoreStudents = true;
          break;
        }
      }

      if (!hasMoreStudents) {
        break; // Truly ended
      }

      i++;
      continue;
    }

    const cleanName = rawName.replace(/\s+/g, ' ').trim();

    // Parse phones (from top or bottom row)
    const phoneRaw = topRow[colMap.phoneCol] || bottomRow[colMap.phoneCol];
    const phones = colMap.phoneCol >= 0
      ? parsePhoneCell(phoneRaw)
      : [];

    // Parse inscription voucher
    const inscriptionVouchers: ParsedVoucher[] = [];
    if (colMap.inscriptionCol >= 0) {
      const amtRaw = topRow[colMap.inscriptionCol];
      const bonRaw = bottomRow[colMap.inscriptionCol];
      const parsed = parsePaymentCell(amtRaw, bonRaw, INSCRIPTION_AMOUNT);
      inscriptionVouchers.push(...parsed);
    }

    // Parse tuition month vouchers
    const tuitionVouchers: ParsedVoucher[] = [];
    for (const col of colMap.monthCols) {
      const amtRaw = topRow[col];
      const bonRaw = bottomRow[col];
      if (!amtRaw && !bonRaw) continue;
      const parsed = parsePaymentCell(amtRaw, bonRaw);
      if (parsed.length === 0 && (amtRaw || bonRaw)) {
        const isNote =
          /حول|تحويل|مجاني|مجانية|مسلك|RMB/i.test(String(amtRaw)) ||
          /حول|تحويل|RMB/i.test(String(bonRaw)) ||
          (amtRaw === '0' && (bonRaw === '0' || !bonRaw));
        if (!isNote) {
          errors.push(
            `Sheet "${sheetName}", row ${i + 1}: Could not parse cell amt="${amtRaw}" bon="${bonRaw}"`
          );
        }
      }
      tuitionVouchers.push(...parsed);
    }

    // Parse book fee vouchers
    const bookVouchers: Array<{ trimNum: 1 | 2 | 3; voucher: ParsedVoucher }> = [];
    for (const b of colMap.bookCols) {
      const amtRaw = topRow[b.col];
      const bonRaw = bottomRow[b.col];
      if (!amtRaw && !bonRaw) continue;
      const parsed = parsePaymentCell(amtRaw, bonRaw);
      if (parsed.length === 0 && (amtRaw || bonRaw)) {
        errors.push(
          `Sheet "${sheetName}", row ${i + 1}: Could not parse book cell amt="${amtRaw}" bon="${bonRaw}"`
        );
      }
      for (const p of parsed) {
        bookVouchers.push({ trimNum: b.trimNum, voucher: p });
      }
    }

    students.push({
      name: cleanName,
      phones,
      inscriptionVouchers,
      tuitionVouchers,
      bookVouchers,
      rowIndex: i,
    });

    i += 2; // advance past both stacked rows of this student
  }

  return { students, nextRow: i };
}

function getCellText(cell: ExcelJS.Cell): string | null {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === 'object' && 'text' in (cell.value as any)) {
    return String((cell.value as any).text);
  }
  if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
    return (cell.value as any).richText.map((r: any) => r.text ?? '').join('');
  }
  return String(cell.value).trim();
}

// ── Class matching ──────────────────────────────────────────────────

type DbClass = {
  id: number;
  name: string;
  branchId: number;
  levelId: number | null;
  formationLevelId?: number | null;
  isFormation?: boolean;
  hasBooks: boolean;
  branch: { id: number; name: string };
  level: { id: number; name: string } | null;
  FormationLevel?: {
    id: number;
    name: string;
    Language?: { id: number; name: string } | null;
  } | null;
};

function buildClassLookup(classes: DbClass[]): Map<string, DbClass> {
  const map = new Map<string, DbClass>();
  for (const c of classes) {
    map.set(`${c.branchId}-${normalizeArabic(c.name)}`, c);
  }
  return map;
}

function matchClass(
  groupName: string,
  levelName: string,
  branchId: number,
  classLookup: Map<string, DbClass>,
  levelByName: Map<string, number>,
  formationLevelByName?: Map<string, number>
): DbClass | null {
  const normGroup = normalizeArabic(groupName);

  // Direct name match in same branch
  const direct = classLookup.get(`${branchId}-${normGroup}`);
  if (direct) return direct;

  // Try partial match: class name contains group name or vice versa
  for (const [key, cls] of classLookup.entries()) {
    if (!key.startsWith(`${branchId}-`)) continue;
    const normClass = normalizeArabic(cls.name);
    if (normClass.includes(normGroup) || normGroup.includes(normClass)) {
      return cls;
    }
  }

  // Try matching by level and any keyword in the group name
  const levelId = levelByName.get(normalizeArabic(levelName));
  if (levelId) {
    for (const [key, cls] of classLookup.entries()) {
      if (!key.startsWith(`${branchId}-`)) continue;
      if (cls.levelId === levelId) {
        const normClass = normalizeArabic(cls.name);
        const words = normGroup.split(' ').filter((w) => w.length > 2);
        if (words.some((w) => normClass.includes(w))) return cls;
      }
    }
  }

  // Try matching by formation level
  if (formationLevelByName) {
    const fLevelId =
      formationLevelByName.get(normalizeArabic(levelName)) ||
      formationLevelByName.get(normGroup);
    if (fLevelId) {
      for (const [key, cls] of classLookup.entries()) {
        if (!key.startsWith(`${branchId}-`)) continue;
        if (cls.isFormation && cls.formationLevelId === fLevelId) {
          const normClass = normalizeArabic(cls.name);
          const words = normGroup.split(' ').filter((w) => w.length > 2);
          if (words.length === 0 || words.some((w) => normClass.includes(w))) return cls;
        }
      }
      // Single formation class match for branch + formationLevelId
      const matching = [...classLookup.values()].filter(
        (c) => c.branchId === branchId && c.isFormation && c.formationLevelId === fLevelId
      );
      if (matching.length === 1) return matching[0];
    }
  }

  // Cross-branch fallback: exact name match in another branch
  for (const [key, cls] of classLookup.entries()) {
    const normClass = normalizeArabic(cls.name);
    if (normClass === normGroup) {
      return cls;
    }
  }

  return null;
}

// ── Voucher & Series helpers ────────────────────────────────────────

async function findOrCreateSeries(branchId: number, levelId: number | null): Promise<number> {
  const existing = await prisma.voucherSeries.findFirst({
    where: {
      issuingBranchId: branchId,
      scope: levelId ? 'LOCAL_LEVEL' : 'LOCAL_BRANCH',
      levelId: levelId ?? null,
    },
  });
  if (existing) return existing.id;

  const created = await prisma.voucherSeries.create({
    data: {
      issuingBranchId: branchId,
      scope: levelId ? 'LOCAL_LEVEL' : 'LOCAL_BRANCH',
      levelId,
      targetBranchId: branchId,
      currentNumber: 0,
    },
  });
  return created.id;
}

async function findOrCreateRefundSeries(branchId: number): Promise<number> {
  const existing = await prisma.voucherSeries.findFirst({
    where: {
      issuingBranchId: branchId,
      scope: 'REFUND',
    },
    orderBy: { id: 'asc' },
  });
  if (existing) return existing.id;

  const created = await prisma.voucherSeries.create({
    data: {
      issuingBranchId: branchId,
      scope: 'REFUND',
      targetBranchId: null,
      currentNumber: 0,
    },
  });
  return created.id;
}

async function createVoucher(opts: {
  studentId: string;
  classId: number;
  seriesId: number;
  number: number;
  amount: number;
  paymentType: string;
  issuingBranchId: number;
  targetBranchId: number;
  issuedAt: Date;
  trimesterId?: number;
  isRefund?: boolean;
  refundForVoucherId?: number | null;
  status?: string;
  isVoided?: boolean;
  remainingBalance?: number | null;
}) {
  const amount = new Decimal(opts.amount);
  return await prisma.voucher.create({
    data: {
      seriesId: opts.seriesId,
      number: opts.number,
      studentId: opts.studentId,
      classId: opts.classId,
      issuingBranchId: opts.issuingBranchId,
      targetBranchId: opts.targetBranchId,
      paymentType: opts.paymentType,
      amount,
      isPartial: false,
      issuedBy: SYSTEM_USER,
      issuedAt: opts.issuedAt,
      isVoided: opts.isVoided ?? false,
      status: opts.status ?? 'ACTIVE',
      trimesterId: opts.trimesterId ?? null,
      isRefund: opts.isRefund ?? false,
      refundForVoucherId: opts.refundForVoucherId ?? null,
      remainingBalance:
        opts.remainingBalance !== undefined && opts.remainingBalance !== null
          ? new Decimal(opts.remainingBalance)
          : null,
    },
  });
}

function updateSeriesMax(map: Map<string, number>, key: string, num: number) {
  const prev = map.get(key) ?? 0;
  if (num > prev) map.set(key, num);
}

function getValidVoucherNumber(num: number, seriesKey: string, seriesMaxNumber: Map<string, number>): number {
  if (num > 0) return num;
  const nextNum = (seriesMaxNumber.get(seriesKey) ?? 0) + 1;
  seriesMaxNumber.set(seriesKey, nextNum);
  return nextNum;
}

// ── Utility helpers ─────────────────────────────────────────────────

function detectBranch(filename: string): number | null {
  const upper = filename.toUpperCase();
  for (const [name, id] of Object.entries(BRANCH_FILE_MAP)) {
    if (upper.includes(name.toUpperCase())) return id;
  }
  return null;
}

function normalizeArabic(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي');
}

async function getNextGlobalNumber(): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ nextNumber: number }>>`
    WITH RECURSIVE seq AS (
      SELECT 1 AS n
      UNION ALL
      SELECT n + 1 FROM seq WHERE n < 10000
    )
    SELECT MIN(n) AS "nextNumber"
    FROM seq
    WHERE n NOT IN (SELECT "globalNumber" FROM "Student")
    LIMIT 1;
  `;
  return result[0]?.nextNumber ?? 1;
}

// ── Run ─────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('\n❌ Import failed:', err);
  process.exit(1);
});
