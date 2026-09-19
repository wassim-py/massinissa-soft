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
 *   - Vouchers (INSCRIPTION + TUITION_4SESSION)
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

// ── Types ───────────────────────────────────────────────────────────

interface ColMap {
  nameCol: number;
  phoneCol: number;
  inscriptionCol: number;
  monthCols: number[];  // ordered list of month column indices
}

interface ParsedStudent {
  name: string;
  phones: string[];
  inscriptionVouchers: ParsedVoucher[];
  tuitionVouchers: ParsedVoucher[];
  rowIndex: number;
}

interface ParsedGroup {
  groupName: string;      // raw header from Excel
  levelName: string;      // from sheet name
  branchId: number;
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

  // Collect Excel files
  const allFiles = fs.readdirSync(DATA_DIR).filter((f) =>
    /\.(xlsx|xls)$/i.test(f)
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
  const [dbClasses, dbLevels, dbStudents] = await Promise.all([
    prisma.class.findMany({
      include: { branch: true, level: true },
    }),
    prisma.level.findMany(),
    prisma.student.findMany({ select: { id: true, name: true, globalNumber: true } }),
  ]);

  const classLookup = buildClassLookup(dbClasses);
  const levelByName = new Map(dbLevels.map((l) => [normalizeArabic(l.name), l.id]));
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
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`PARSE SUMMARY`);
  console.log(`  Groups found:   ${allGroups.length}`);
  console.log(`  Students found: ${totalStudentsFound}`);
  if (parseErrors.length > 0) {
    console.log(`\n⚠  PARSE WARNINGS (${parseErrors.length}):`);
    parseErrors.forEach((e) => console.log(`   - ${e}`));
  }

  // Check group matching
  const unmatchedGroups: string[] = [];
  for (const g of allGroups) {
    const cls = matchClass(g.groupName, g.levelName, g.branchId, classLookup, levelByName);
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
  let skippedGroups = 0;

  for (const group of allGroups) {
    const cls = matchClass(group.groupName, group.levelName, group.branchId, classLookup, levelByName);
    if (!cls) {
      skippedGroups++;
      continue;
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
        const exists = await prisma.voucher.findFirst({
          where: { studentId, classId: cls.id, paymentType: 'INSCRIPTION', number: v.number, seriesId },
        });
        if (!exists) {
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId,
            number: v.number,
            amount: v.amount || INSCRIPTION_AMOUNT,
            paymentType: 'INSCRIPTION',
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: v.date,
          });
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, seriesKey, v.number);
        }
      }

      // Tuition vouchers
      for (const v of student.tuitionVouchers) {
        const exists = await prisma.voucher.findFirst({
          where: { studentId, classId: cls.id, paymentType: 'TUITION_4SESSION', number: v.number, seriesId },
        });
        if (!exists) {
          await createVoucher({
            studentId,
            classId: cls.id,
            seriesId,
            number: v.number,
            amount: v.amount,
            paymentType: 'TUITION_4SESSION',
            issuingBranchId: group.branchId,
            targetBranchId: cls.branchId,
            issuedAt: v.date,
          });
          createdVouchers++;
          updateSeriesMax(seriesMaxNumber, seriesKey, v.number);
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

  console.log(`\n${'═'.repeat(60)}`);
  console.log('IMPORT COMPLETE');
  console.log(`  Students created:    ${createdStudents}`);
  console.log(`  Enrollments created: ${createdEnrollments}`);
  console.log(`  Vouchers created:    ${createdVouchers}`);
  console.log(`  Groups skipped:      ${skippedGroups} (no class match)`);
  console.log(`${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
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
      groups.push({ groupName, levelName, branchId, students });
      console.log(`     Group: "${groupName}" → ${students.length} students`);
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

  for (let c = 0; c < headerRow.length; c++) {
    const text = (headerRow[c] ?? '').trim();
    if (nameCol < 0 && COL_NAME_KEYWORDS.some((kw) => text.includes(kw))) {
      nameCol = c;
    } else if (phoneCol < 0 && COL_PHONE_KEYWORDS.some((kw) => text.includes(kw))) {
      phoneCol = c;
    } else if (inscriptionCol < 0 && COL_INSCRIPTION_KEYWORDS.some((kw) => text.includes(kw))) {
      inscriptionCol = c;
    } else if (COL_MONTH_KEYWORDS.some((kw) => text.includes(kw))) {
      monthCols.push(c);
    }
  }

  if (nameCol < 0) return null;

  return { nameCol, phoneCol, inscriptionCol, monthCols };
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

    // If no name or empty row, the table has ended (handles 1, 2, or more empty rows)
    if (!rawName) {
      break;
    }

    // Parse phones
    const phones = colMap.phoneCol >= 0
      ? parsePhoneCell(topRow[colMap.phoneCol])
      : [];

    // Parse inscription voucher
    const inscriptionVouchers: ParsedVoucher[] = [];
    if (colMap.inscriptionCol >= 0) {
      const amtRaw = topRow[colMap.inscriptionCol];
      const bonRaw = bottomRow[colMap.inscriptionCol];
      const parsed = parsePaymentCell(amtRaw, bonRaw);
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
        errors.push(
          `Sheet "${sheetName}", row ${i + 1}: Could not parse cell amt="${amtRaw}" bon="${bonRaw}"`
        );
      }
      tuitionVouchers.push(...parsed);
    }

    students.push({
      name: rawName,
      phones,
      inscriptionVouchers,
      tuitionVouchers,
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
  hasBooks: boolean;
  branch: { id: number; name: string };
  level: { id: number; name: string } | null;
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
  levelByName: Map<string, number>
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

  return null;
}

// ── Voucher & Series helpers ────────────────────────────────────────

async function findOrCreateSeries(branchId: number, levelId: number | null): Promise<number> {
  const existing = await prisma.voucherSeries.findFirst({
    where: {
      issuingBranchId: branchId,
      scope: 'LOCAL_LEVEL',
      levelId: levelId ?? undefined,
    },
  });
  if (existing) return existing.id;

  const created = await prisma.voucherSeries.create({
    data: {
      issuingBranchId: branchId,
      scope: 'LOCAL_LEVEL',
      levelId,
      targetBranchId: branchId,
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
}) {
  const amount = new Decimal(opts.amount);
  await prisma.voucher.create({
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
      isVoided: false,
      status: 'ACTIVE',
    },
  });
}

function updateSeriesMax(map: Map<string, number>, key: string, num: number) {
  const prev = map.get(key) ?? 0;
  if (num > prev) map.set(key, num);
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
