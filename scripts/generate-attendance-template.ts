/**
 * scripts/generate-attendance-template.ts
 * ═══════════════════════════════════════════════════════════════════
 * Generates grid-style Excel (.xlsx) attendance templates.
 *
 * The layout MIRRORS the physical printed roster:
 *   - One Excel file per class/group under data/attendance/
 *   - Rows   = enrolled students
 *   - Columns = lesson dates (pre-filled with existing lessons, plus
 *               additional date slots up to 12 sessions so you can
 *               enter any past dates directly)
 *   - Row 3  = "حصة مجانية؟ (1=نعم / 0=لا)" row where you can mark
 *              free lessons with 1 so they don't consume students' vouchers!
 *   - Book columns appended on the right (T1 / T2 / T3) if class has books
 *
 * FOR GROUPS THAT HAVEN'T STARTED YET:
 *   Just leave the file alone! If no dates are entered, the importer
 *   skips the file, leaving the students' balance intact (4 sessions
 *   per tuition voucher, 0 sessions attended).
 *
 * HOW TO FILL:
 *   1. Check Row 4 (dates): add or adjust lesson dates (DD/MM/YYYY)
 *   2. Check Row 3 (free lesson?): put 1 if that session was free, 0 if regular
 *   3. For each student:
 *      - 1 (or X) = PRESENT
 *      - 0 (or blank) = ABSENT
 *   4. Book columns (if applicable):
 *      - 1 = received book for that trimester
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { prisma } from './lib/db';

const OUTPUT_DIR = path.join(__dirname, '../data/attendance');
const DEFAULT_TOTAL_LESSON_SLOTS = 12; // Provide up to 12 lesson slots per group

// ── Color scheme ──────────────────────────────────────────────────
const COLOR_HEADER_BG    = 'FF1F3864'; // dark navy
const COLOR_HEADER_FG    = 'FFFFFFFF'; // white text
const COLOR_DATE_BG      = 'FF2E75B6'; // blue       — lesson date headers
const COLOR_FREE_ROW_BG  = 'FFFCE4D6'; // peach      — free lesson indicator row
const COLOR_FREE_ROW_FG  = 'FFC00000'; // dark red
const COLOR_BOOK_BG      = 'FF833C00'; // brown      — book columns
const COLOR_STUDENT_BG   = 'FFFFFACD'; // light yellow — student name column
const COLOR_GRID_BORDER  = 'FFB8CCE4'; // light blue border
const COLOR_GROUP_TITLE  = 'FF0070C0'; // bright blue — group title row

async function main() {
  const classFilter = (() => {
    const idx = process.argv.indexOf('--class');
    return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : null;
  })();

  const branchFilter = (() => {
    const idx = process.argv.indexOf('--branch');
    return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 1; // Default to branch 1 (ECOLE)
  })();

  console.log(`\n📋 Generating attendance grid templates (Branch ${branchFilter})...\n`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const classes = await prisma.class.findMany({
    where: {
      branchId: branchFilter,
      ...(classFilter ? { id: classFilter } : {}),
    },
    include: {
      branch: true,
      level: true,
      teacher: { select: { id: true, name: true } },
      lessons: {
        orderBy: { startsAt: 'asc' },
      },
      enrollments: {
        include: {
          student: { select: { id: true, name: true, globalNumber: true } },
        },
        orderBy: { enrolledAt: 'asc' },
      },
    },
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  });

  if (classes.length === 0) {
    console.log('⚠  No classes found.');
    await prisma.$disconnect();
    return;
  }

  let filesCreated = 0;

  for (const cls of classes) {
    // Deduplicate and sort students
    const studentsMap = new Map<string, { id: string; name: string; globalNumber: number }>();
    for (const enr of cls.enrollments) {
      if (!studentsMap.has(enr.studentId)) {
        studentsMap.set(enr.studentId, {
          id: enr.student.id,
          name: enr.student.name,
          globalNumber: enr.student.globalNumber,
        });
      }
    }
    const students = [...studentsMap.values()].sort((a, b) => a.globalNumber - b.globalNumber);

    if (students.length === 0) {
      // Skip classes with 0 enrolled students
      continue;
    }

    await generateGroupTemplate(cls, students, cls.lessons);
    filesCreated++;
  }

  console.log(`\n✅ Generated ${filesCreated} template file(s) in: ${OUTPUT_DIR}`);
  console.log('\nInstructions for filling:');
  console.log('  1. Open each .xlsx file in Excel.');
  console.log('  2. For groups that have not started yet: leave the file untouched.');
  console.log('  3. In Row 4 (تاريخ الحصة): check the lesson dates, or type new dates (DD/MM/YYYY).');
  console.log('  4. In Row 3 (حصة مجانية؟): put 1 if that session was a FREE lesson (0 if paid).');
  console.log('  5. For each student: type 1 for present, 0 for absent.');
  console.log('  6. Fill Book columns (T1/T2/T3) if applicable.');
  console.log('  7. Save the file and run: npm run import:attendance:dry');

  await prisma.$disconnect();
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate one Excel file per class/group
// ─────────────────────────────────────────────────────────────────────────────

async function generateGroupTemplate(
  cls: any,
  students: Array<{ id: string; name: string; globalNumber: number }>,
  existingLessons: any[]
) {
  const safeFilename = sanitizeFilename(`${cls.branch.name}_${cls.name}`);
  const filePath = path.join(OUTPUT_DIR, `${safeFilename}.xlsx`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Import System';
  wb.created = new Date();

  const ws = wb.addWorksheet('Présences', {
    views: [{ rightToLeft: false }],
  });

  const NUM_COL   = 1;
  const NAME_COL  = 2;
  const FIRST_LESSON_COL = 3;

  // We provide at least DEFAULT_TOTAL_LESSON_SLOTS slots, or more if existingLessons exceeds it
  const numSlots = Math.max(DEFAULT_TOTAL_LESSON_SLOTS, existingLessons.length);
  const LAST_LESSON_COL = FIRST_LESSON_COL + numSlots - 1;
  const hasBooks = Boolean(cls.hasBooks);
  const BOOK_T1_COL = LAST_LESSON_COL + 1;
  const BOOK_T2_COL = LAST_LESSON_COL + 2;
  const BOOK_T3_COL = LAST_LESSON_COL + 3;
  const LAST_COL = hasBooks ? BOOK_T3_COL : LAST_LESSON_COL;

  const TITLE_ROW     = 1;
  const META_ROW      = 2;   // hidden metadata
  const FREE_FLAG_ROW = 3;   // Free lesson flag row: 1 = free, 0 = paid
  const DATE_ROW      = 4;   // Date header row (DD/MM/YYYY)
  const FIRST_DATA_ROW = 5;

  // ── Row 1: Title ──────────────────────────────────────────────────
  ws.mergeCells(TITLE_ROW, NUM_COL, TITLE_ROW, LAST_COL);
  const titleCell = ws.getCell(TITLE_ROW, NUM_COL);
  titleCell.value = `${cls.name}  |  ${cls.branch.name}  |  ${cls.level?.name ?? ''}  |  ${cls.teacher?.name ?? ''}`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLOR_HEADER_FG } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GROUP_TITLE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(TITLE_ROW).height = 28;

  // ── Row 2: Metadata (hidden) ──────────────────────────────────────
  ws.getCell(META_ROW, 1).value = `class_id=${cls.id}`;
  ws.getCell(META_ROW, 2).value = `branch_id=${cls.branchId}`;
  ws.getCell(META_ROW, 3).value = `has_books=${hasBooks}`;
  ws.getRow(META_ROW).hidden = true;

  // ── Row 3: Free lesson indicator row ──────────────────────────────
  ws.getRow(FREE_FLAG_ROW).height = 24;
  ws.mergeCells(FREE_FLAG_ROW, NUM_COL, FREE_FLAG_ROW, NAME_COL);
  const freeLabelCell = ws.getCell(FREE_FLAG_ROW, NUM_COL);
  freeLabelCell.value = 'حصة مجانية؟ (1 = نعم / 0 = عادية)';
  freeLabelCell.font = { bold: true, size: 9, color: { argb: COLOR_FREE_ROW_FG } };
  freeLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FREE_ROW_BG } };
  freeLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  setBorder(freeLabelCell);
  setBorder(ws.getCell(FREE_FLAG_ROW, NAME_COL));

  for (let s = 0; s < numSlots; s++) {
    const col = FIRST_LESSON_COL + s;
    const lesson = existingLessons[s];
    const cell = ws.getCell(FREE_FLAG_ROW, col);
    cell.value = lesson ? (lesson.isFree ? 1 : 0) : 0;
    cell.font = { bold: true, size: 10, color: { argb: COLOR_FREE_ROW_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FREE_ROW_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setBorder(cell);
  }

  if (hasBooks) {
    for (const bCol of [BOOK_T1_COL, BOOK_T2_COL, BOOK_T3_COL]) {
      const cell = ws.getCell(FREE_FLAG_ROW, bCol);
      cell.value = '';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      setBorder(cell);
    }
  }

  // ── Row 4: Column headers (Dates) ─────────────────────────────────
  ws.getRow(DATE_ROW).height = 42;

  setHeaderCell(ws, DATE_ROW, NUM_COL, '#', COLOR_HEADER_BG);
  ws.getColumn(NUM_COL).width = 5;

  setHeaderCell(ws, DATE_ROW, NAME_COL, 'الاسم واللقب', COLOR_HEADER_BG);
  ws.getColumn(NAME_COL).width = 30;

  for (let s = 0; s < numSlots; s++) {
    const col = FIRST_LESSON_COL + s;
    const lesson = existingLessons[s];
    let dateLabel = '';
    if (lesson) {
      const d = lesson.startsAt;
      dateLabel = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    setHeaderCell(ws, DATE_ROW, col, dateLabel, COLOR_DATE_BG);
    ws.getColumn(col).width = 11;
  }

  if (hasBooks) {
    setHeaderCell(ws, DATE_ROW, BOOK_T1_COL, 'كتاب\nت 1', COLOR_BOOK_BG);
    setHeaderCell(ws, DATE_ROW, BOOK_T2_COL, 'كتاب\nت 2', COLOR_BOOK_BG);
    setHeaderCell(ws, DATE_ROW, BOOK_T3_COL, 'كتاب\nت 3', COLOR_BOOK_BG);
    ws.getColumn(BOOK_T1_COL).width = 8;
    ws.getColumn(BOOK_T2_COL).width = 8;
    ws.getColumn(BOOK_T3_COL).width = 8;
  }

  // ── Rows 5+: Students ─────────────────────────────────────────────
  for (let s = 0; s < students.length; s++) {
    const student = students[s];
    const rowIdx = FIRST_DATA_ROW + s;
    const row = ws.getRow(rowIdx);
    row.height = 19;
    const rowBg = s % 2 === 0 ? 'FFFFFFFF' : 'FFF0F5FF';

    // # cell
    const numCell = row.getCell(NUM_COL);
    numCell.value = student.globalNumber;
    numCell.font = { size: 9, color: { argb: '666666' } };
    numCell.alignment = { horizontal: 'center', vertical: 'middle' };
    numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_STUDENT_BG } };
    setBorder(numCell);

    // Name cell (store student_id in cell note)
    const nameCell = row.getCell(NAME_COL);
    nameCell.value = student.name;
    nameCell.font = { bold: true, size: 10 };
    nameCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_STUDENT_BG } };
    (nameCell as any).note = { texts: [{ text: `student_id:${student.id}` }] };
    setBorder(nameCell);

    // Lesson cells — default 0
    for (let l = 0; l < numSlots; l++) {
      const col = FIRST_LESSON_COL + l;
      const cell = row.getCell(col);
      cell.value = 0;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      setBorder(cell);
    }

    // Book cells
    if (hasBooks) {
      for (const bookCol of [BOOK_T1_COL, BOOK_T2_COL, BOOK_T3_COL]) {
        const cell = row.getCell(bookCol);
        cell.value = 0;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { size: 11, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E8' } };
        setBorder(cell);
      }
    }
  }

  // Freeze panes
  ws.views = [
    {
      state: 'frozen',
      xSplit: NAME_COL,
      ySplit: DATE_ROW,
      topLeftCell: `${colLetter(FIRST_LESSON_COL)}${FIRST_DATA_ROW}`,
      activeCell: `${colLetter(FIRST_LESSON_COL)}${FIRST_DATA_ROW}`,
    },
  ];

  // ── Instructions sheet ────────────────────────────────────────────
  const wsInstr = wb.addWorksheet('📖 Instructions');
  (wsInstr as any).properties = { ...((wsInstr as any).properties ?? {}), tabColor: { argb: 'FF70AD47' } };
  wsInstr.getColumn(1).width = 75;
  const instructions = [
    ['تعليمات ملء الحضور والكتب / Instructions'],
    [''],
    ['1. للأفواج التي لم تبدأ بعد (فقط التسجيلات مفتوحة) :'],
    ['   → اترك الملف كما هو دون ملء! سيتم احتساب رصيد الحصص كاملاً تلقائياً.'],
    [''],
    ['2. للأفواج التي بدأت ولها حصص سابقة :'],
    ['   → السطر 4 (تاريخ الحصة): اكتب تواريخ الحصص بالصيغة يوم/شهر/سنة (مثال: 04/08/2026)'],
    ['   → السطر 3 (حصة مجانية؟): اكتب 1 إذا كانت الحصة مجانية، أو 0 إذا كانت عادية'],
    ['      (الحصص المجانية لا تخصم من رصيد الـ 4 حصص للطالب)'],
    ['   → لكل طالب: اكتب 1 إذا كان حاضراً، و0 إذا كان غائباً'],
    [''],
    ['3. للأفواج التي لها كتب (ت1 / ت2 / ت3) :'],
    ['   → اكتب 1 في خانة الفصل إذا استلم الطالب كتابه، أو 0 إذا لم يستلم'],
    [''],
    ['4. احفظ الملف (Ctrl+S) بعد الانتهاء ثم شغّل أمر الاستيراد.'],
  ];
  for (const [i, row] of instructions.entries()) {
    const cell = wsInstr.getCell(i + 1, 1);
    cell.value = row[0];
    if (i === 0) {
      cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    }
  }

  await wb.xlsx.writeFile(filePath);
  console.log(`  ✅ ${path.basename(filePath)}  (${students.length} students, ${numSlots} lesson slots)`);
}

// ── Helpers ───────────────────────────────────────────────────────

function setHeaderCell(ws: ExcelJS.Worksheet, row: number, col: number, value: string, bgColor: string) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  setBorder(cell);
}

function setBorder(cell: ExcelJS.Cell) {
  const borderStyle: ExcelJS.BorderStyle = 'thin';
  const color = { argb: COLOR_GRID_BORDER };
  cell.border = {
    top:    { style: borderStyle, color },
    left:   { style: borderStyle, color },
    bottom: { style: borderStyle, color },
    right:  { style: borderStyle, color },
  };
}

function colLetter(col: number): string {
  let result = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
