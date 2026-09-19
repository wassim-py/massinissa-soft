/**
 * scripts/import-attendance.ts
 * ═══════════════════════════════════════════════════════════════════
 * Reads the filled grid-style Excel templates (one per class) and
 * imports Attendance + BookReceipt records into the database.
 *
 * FEATURES:
 *   - Auto-detects lesson dates from Row 4
 *   - Supports FREE lessons from Row 3:
 *       If marked free (1), the lesson is created with isFree=true,
 *       which means it does NOT consume the student's 4-session voucher balance!
 *   - Automatically creates any past lesson not yet in the DB as isExtra=true
 *   - For groups that haven't started yet (0 dates filled): cleanly skips
 *     without modifying student balance (remaining balance = Vouchers × 4).
 *   - Imports Book Receipts for Trimester 1, 2, 3 if marked with 1.
 *
 * USAGE:
 *   npx tsx scripts/import-attendance.ts --dry-run
 *   npx tsx scripts/import-attendance.ts
 *   npx tsx scripts/import-attendance.ts --file "data/attendance/ECOLE_نذير_علمي.xlsx"
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { prisma } from './lib/db';

const ATTENDANCE_DIR = path.join(__dirname, '../data/attendance');
const SYSTEM_USER = 'system_import';

// Trimester IDs from DB
const TRIMESTER_IDS: Record<1 | 2 | 3, number> = {
  1: 24,  // T1 - active
  2: 25,  // T2
  3: 26,  // T3
};

// Fixed row and col positions
const META_ROW       = 2;
const FREE_FLAG_ROW  = 3;
const DATE_ROW       = 4;
const FIRST_DATA_ROW = 5;
const NUM_COL        = 1;
const NAME_COL       = 2;
const FIRST_LESSON_COL = 3;

interface ColumnInfo {
  col: number;
  date: Date;
  dateStr: string;
  isFree: boolean;
  lessonId: number | null; // will be resolved or created
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fileArg = (() => {
    const idx = process.argv.indexOf('--file');
    return idx >= 0 ? process.argv[idx + 1] : null;
  })();

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  ATTENDANCE IMPORTER  ${dryRun ? '[DRY RUN — NO DB WRITES]' : '[EXECUTE MODE]'}`);
  console.log(`${'═'.repeat(65)}\n`);

  if (!fs.existsSync(ATTENDANCE_DIR)) {
    console.log(`Attendance directory not found: ${ATTENDANCE_DIR}`);
    console.log('Generate templates first: npm run import:template');
    return;
  }

  // Collect xlsx files
  let files: string[];
  if (fileArg) {
    const resolved = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
    files = [resolved];
  } else {
    files = fs
      .readdirSync(ATTENDANCE_DIR)
      .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$') && !f.includes('SAMPLE') && !f.includes('DEMO'))
      .map((f) => path.join(ATTENDANCE_DIR, f));
  }

  if (files.length === 0) {
    console.log('No attendance .xlsx files found in', ATTENDANCE_DIR);
    console.log('Generate templates: npm run import:template');
    return;
  }

  // Preload classes with teacher, branch, level, classrooms
  const classes = await prisma.class.findMany({
    include: {
      teacher: true,
      branch: { include: { classrooms: true } },
      level: true,
      lessons: {
        orderBy: { startsAt: 'asc' },
      },
    },
  });
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const bookCache = new Map<string, number>();

  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLessonsCreated = 0;
  let totalBooksCreated = 0;
  let totalReceiptsCreated = 0;
  let totalSkippedGroups = 0;
  const allErrors: string[] = [];

  for (const filePath of files) {
    console.log(`\n📄 File: ${path.basename(filePath)}`);

    const result = await processFile(filePath, classMap, bookCache, dryRun);

    if (result.notStarted) {
      totalSkippedGroups++;
      continue;
    }

    totalPresent         += result.present;
    totalAbsent          += result.absent;
    totalLessonsCreated  += result.lessonsCreated;
    totalBooksCreated    += result.booksCreated;
    totalReceiptsCreated += result.receiptsCreated;
    allErrors.push(...result.errors);
  }

  console.log(`\n${'═'.repeat(65)}`);
  console.log(dryRun ? 'DRY RUN SUMMARY' : 'IMPORT COMPLETE');
  console.log(`  Attendance PRESENT records:  ${totalPresent}`);
  console.log(`  Attendance ABSENT records:   ${totalAbsent}`);
  console.log(`  New past lessons created:    ${totalLessonsCreated}`);
  console.log(`  Groups not started (skipped): ${totalSkippedGroups}`);
  console.log(`  Placeholder books created:   ${totalBooksCreated}`);
  console.log(`  Book receipts created:       ${totalReceiptsCreated}`);
  if (allErrors.length > 0) {
    console.log(`\n⚠  WARNINGS (${allErrors.length}):`);
    allErrors.slice(0, 30).forEach((e) => console.log(`  - ${e}`));
  }
  console.log(`${'═'.repeat(65)}\n`);

  await prisma.$disconnect();
}

async function processFile(
  filePath: string,
  classMap: Map<number, any>,
  bookCache: Map<string, number>,
  dryRun: boolean
): Promise<{
  present: number; absent: number; lessonsCreated: number;
  booksCreated: number; receiptsCreated: number; notStarted: boolean;
  errors: string[];
}> {
  const res = {
    present: 0, absent: 0, lessonsCreated: 0,
    booksCreated: 0, receiptsCreated: 0, notStarted: false,
    errors: [] as string[],
  };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e: any) {
    res.errors.push(`Cannot read file: ${e.message}`);
    return res;
  }

  const ws = wb.worksheets.find((s) => !s.name.includes('Instruction') && !s.name.includes('📖'));
  if (!ws) {
    res.errors.push('No attendance worksheet found');
    return res;
  }

  // ── Read Metadata ─────────────────────────────────────────────────
  const metaA = String(ws.getCell(META_ROW, 1).value ?? '');
  const classIdMatch = metaA.match(/class_id=(\d+)/);
  if (!classIdMatch) {
    res.errors.push('Cannot read class_id from row 2');
    return res;
  }
  const classId = parseInt(classIdMatch[1], 10);
  const cls = classMap.get(classId);
  if (!cls) {
    res.errors.push(`Class id=${classId} not found in DB`);
    return res;
  }

  const metaC = String(ws.getCell(META_ROW, 3).value ?? '');
  const hasBooks = metaC.includes('true') || Boolean(cls.hasBooks);

  // ── Read Lesson Columns (Row 4 Dates & Row 3 Free Flags) ─────────
  const dateRow = ws.getRow(DATE_ROW);
  const freeRow = ws.getRow(FREE_FLAG_ROW);

  const lessonCols: ColumnInfo[] = [];
  let bookCols: Array<{ col: number; trimNum: 1 | 2 | 3 }> = [];

  dateRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber < FIRST_LESSON_COL) return;

    const cellText = getCellText(cell);
    if (!cellText) return;

    // Check if this is a book column
    if (cellText.includes('كتاب') || cellText.includes('ت 1') || cellText.includes('ت1')) {
      bookCols.push({ col: colNumber, trimNum: 1 });
      return;
    }
    if (cellText.includes('ت 2') || cellText.includes('ت2')) {
      bookCols.push({ col: colNumber, trimNum: 2 });
      return;
    }
    if (cellText.includes('ت 3') || cellText.includes('ت3')) {
      bookCols.push({ col: colNumber, trimNum: 3 });
      return;
    }

    // Try parsing date: DD/MM/YYYY or YYYY-MM-DD
    const parsedDate = parseDateValue(cell.value);
    if (!parsedDate) return; // empty slot or unparseable

    // Read free flag from Row 3
    const freeVal = freeRow.getCell(colNumber).value;
    const isFree = freeVal === 1 || freeVal === '1' || String(freeVal).includes('نعم') || freeVal === true;

    lessonCols.push({
      col: colNumber,
      date: parsedDate,
      dateStr: parsedDate.toISOString().slice(0, 10),
      isFree,
      lessonId: null,
    });
  });

  if (lessonCols.length === 0) {
    console.log(`   Group: "${cls.name}" — 0 lesson dates entered (not started yet). Skipping.`);
    res.notStarted = true;
    return res;
  }

  // ── First pass: check if this file was actually filled by the user ──
  let hasAnyMark = false;
  let checkRow = FIRST_DATA_ROW;
  while (true) {
    const row = ws.getRow(checkRow);
    const nameVal = getCellText(row.getCell(NAME_COL));
    if (!nameVal) break;

    for (const lCol of lessonCols) {
      const val = row.getCell(lCol.col).value;
      if (val === 1 || val === '1' || String(val).toUpperCase() === 'X') {
        hasAnyMark = true;
        break;
      }
    }
    if (hasAnyMark) break;

    for (const b of bookCols) {
      const val = row.getCell(b.col).value;
      if (val === 1 || val === '1' || String(val).toUpperCase() === 'X') {
        hasAnyMark = true;
        break;
      }
    }
    if (hasAnyMark) break;
    checkRow++;
  }

  if (!hasAnyMark) {
    console.log(`   Group: "${cls.name}" — no attendance marks entered (group not started or file untouched). Skipping.`);
    res.notStarted = true;
    return res;
  }

  console.log(`   Group: "${cls.name}" → ${lessonCols.length} lesson dates found:`);
  lessonCols.forEach((l) => {
    console.log(`     - ${l.dateStr} ${l.isFree ? '🎁 [FREE LESSON]' : '💼 [Paid Lesson]'}`);
  });

  // ── Resolve or Create Lessons in DB ───────────────────────────────
  const existingLessons = await prisma.lesson.findMany({
    where: { classId },
    select: { id: true, startsAt: true, isFree: true },
  });

  for (const lCol of lessonCols) {
    const matched = existingLessons.find(
      (l) => l.startsAt.toISOString().slice(0, 10) === lCol.dateStr
    );

    if (matched) {
      lCol.lessonId = matched.id;
      // If user marked it free in Excel, ensure it is set as free in DB
      if (lCol.isFree && !matched.isFree && !dryRun) {
        await prisma.lesson.update({
          where: { id: matched.id },
          data: { isFree: true },
        });
      }
    } else {
      // Create extra lesson for this date
      if (!dryRun) {
        const classroomId = cls.branch.classrooms[0]?.id ?? await getFirstClassroomId(cls.branchId);
        const startsAt = new Date(lCol.dateStr + 'T10:00:00Z');
        const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

        const newLesson = await prisma.lesson.create({
          data: {
            classId,
            teacherId: cls.teacherId,
            classroomId,
            branchId: cls.branchId,
            startsAt,
            endsAt,
            isExtra: true,
            isCatchUp: false,
            isFree: lCol.isFree,
          },
        });
        lCol.lessonId = newLesson.id;
        res.lessonsCreated++;
      } else {
        lCol.lessonId = -1; // placeholder for dry-run
        res.lessonsCreated++;
      }
    }
  }

  // ── Read Student Rows ─────────────────────────────────────────────
  let rowIdx = FIRST_DATA_ROW;
  while (true) {
    const row = ws.getRow(rowIdx);
    const nameCell = row.getCell(NAME_COL);
    const nameVal = getCellText(nameCell);
    if (!nameVal) break; // end of student list

    // Extract student_id from note
    const noteText = ((nameCell as any).note as any)?.texts?.[0]?.text
      ?? (typeof (nameCell as any).note === 'string' ? (nameCell as any).note : '');
    const studentIdMatch = String(noteText).match(/student_id:([a-f0-9\-]{36})/i);
    if (!studentIdMatch) {
      res.errors.push(`Row ${rowIdx}: Cannot read student_id for "${nameVal}"`);
      rowIdx++;
      continue;
    }
    const studentId = studentIdMatch[1];

    // ── Process Attendance for Each Lesson ──────────────────────────
    for (const lCol of lessonCols) {
      if (!lCol.lessonId) continue;

      const val = row.getCell(lCol.col).value;
      const isPresent = val === 1 || val === '1' || String(val).toUpperCase() === 'X';

      if (!dryRun && lCol.lessonId > 0) {
        const existingAtt = await prisma.attendance.findFirst({
          where: { studentId, lessonId: lCol.lessonId },
        });
        if (!existingAtt) {
          await prisma.attendance.create({
            data: {
              studentId,
              lessonId: lCol.lessonId,
              status: isPresent ? 'PRESENT' : 'ABSENT',
            },
          });
        } else if (existingAtt.status !== (isPresent ? 'PRESENT' : 'ABSENT')) {
          await prisma.attendance.update({
            where: { id: existingAtt.id },
            data: { status: isPresent ? 'PRESENT' : 'ABSENT' },
          });
        }
      }

      if (isPresent) res.present++; else res.absent++;
    }

    // ── Process Book Receipts ───────────────────────────────────────
    if (hasBooks && cls.teacherId && cls.levelId) {
      for (const { col, trimNum } of bookCols) {
        const val = row.getCell(col).value;
        const gotBook = val === 1 || val === '1' || String(val).toUpperCase() === 'X';
        if (!gotBook) continue;

        const trimId = TRIMESTER_IDS[trimNum];
        const bookKey = `${cls.teacherId}-${cls.levelId}-${trimId}`;

        let bookId = bookCache.get(bookKey);
        if (!bookId) {
          if (!dryRun) {
            const existingBook = await prisma.book.findFirst({
              where: { teacherId: cls.teacherId, levelId: cls.levelId, trimesterId: trimId },
            });
            if (existingBook) {
              bookId = existingBook.id;
            } else {
              const newBook = await prisma.book.create({
                data: {
                  title: `كتاب ت${trimNum}`,
                  teacherId: cls.teacherId,
                  levelId: cls.levelId,
                  trimesterId: trimId,
                },
              });
              bookId = newBook.id;
              res.booksCreated++;
            }
            bookCache.set(bookKey, bookId);
          } else {
            res.booksCreated++;
          }
        }

        if (!dryRun && bookId) {
          const existingReceipt = await prisma.bookReceipt.findFirst({
            where: { studentId, bookId },
          });
          if (!existingReceipt) {
            await prisma.bookReceipt.create({
              data: {
                studentId,
                bookId,
                receivedAt: new Date(),
                receivedBy: SYSTEM_USER,
              },
            });
            res.receiptsCreated++;
          }
        }
      }
    }

    rowIdx++;
  }

  console.log(`   → ${res.present} present, ${res.absent} absent records`);
  return res;
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseDateValue(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  const str = String(val).trim();
  // Format DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dt = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  // Format YYYY-MM-DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const dt = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function getCellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  if (typeof v === 'object' && 'richText' in (v as any)) {
    return (v as any).richText.map((r: any) => r.text ?? '').join('').trim();
  }
  if (typeof v === 'object' && 'text' in (v as any)) {
    return String((v as any).text).trim();
  }
  return String(v).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

async function getFirstClassroomId(branchId: number): Promise<number> {
  const classroom = await prisma.classroom.findFirst({ where: { branchId } });
  if (!classroom) throw new Error(`No classroom found for branch ${branchId}`);
  return classroom.id;
}

main().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
