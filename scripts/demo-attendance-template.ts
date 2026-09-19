/**
 * scripts/demo-attendance-template.ts
 * Generates a DEMO template with fake data so you can see the format
 * before running the full import. 
 * Run: npx tsx scripts/demo-attendance-template.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';

const OUTPUT_DIR = path.join(__dirname, '../data/attendance');

const COLOR_HEADER_BG   = 'FF1F3864';
const COLOR_DATE_BG     = 'FF2E75B6';
const COLOR_BOOK_BG     = 'FF833C00';
const COLOR_STUDENT_BG  = 'FFFFFACD';
const COLOR_GRID_BORDER = 'FFB8CCE4';
const COLOR_GROUP_TITLE = 'FF0070C0';

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Import System — DEMO';

  const ws = wb.addWorksheet('Présences', { views: [{ rightToLeft: false }] });

  // Fake data
  const className  = 'بن يحي BAC [ECOLE] — عينة توضيحية';
  const classId    = 44;
  const branchId   = 1;
  const hasBooks   = true;
  const students   = [
    { id: 'aaa-111', name: 'بن عمارة هبة الله', globalNumber: 1 },
    { id: 'bbb-222', name: 'غربي جمالة',         globalNumber: 2 },
    { id: 'ccc-333', name: 'بالعلي ندى',          globalNumber: 3 },
    { id: 'ddd-444', name: 'قداوي ناديين',        globalNumber: 4 },
    { id: 'eee-555', name: 'لوصيف أمينة وصال',    globalNumber: 5 },
    { id: 'fff-666', name: 'حميص هبة الرحمان',    globalNumber: 6 },
    { id: 'ggg-777', name: 'جبريلي آية الرحمان',  globalNumber: 7 },
    { id: 'hhh-888', name: 'سليبي سراء',           globalNumber: 8 },
    { id: 'iii-999', name: 'زويد إسكندر',          globalNumber: 9 },
    { id: 'jjj-000', name: 'خالص أيمن',            globalNumber: 10 },
  ];
  const lessons = [
    { id: 101, startsAt: new Date('2026-08-04T10:00:00Z') },
    { id: 102, startsAt: new Date('2026-08-09T10:00:00Z') },
    { id: 103, startsAt: new Date('2026-08-16T10:00:00Z') },
    { id: 104, startsAt: new Date('2026-08-17T10:00:00Z') },
    { id: 105, startsAt: new Date('2026-08-18T10:00:00Z') },
    { id: 106, startsAt: new Date('2026-08-24T10:00:00Z') },
    { id: 107, startsAt: new Date('2026-09-04T10:00:00Z') },
    { id: 108, startsAt: new Date('2026-09-09T10:00:00Z') },
    { id: 109, startsAt: new Date('2026-09-12T10:00:00Z') },
    { id: 110, startsAt: new Date('2026-09-13T10:00:00Z') },
  ];

  const NUM_COL = 1, NAME_COL = 2, FIRST_LESSON_COL = 3;
  const LAST_LESSON_COL = FIRST_LESSON_COL + lessons.length - 1;
  const BOOK_T1_COL = LAST_LESSON_COL + 1;
  const BOOK_T2_COL = LAST_LESSON_COL + 2;
  const BOOK_T3_COL = LAST_LESSON_COL + 3;
  const LAST_COL = BOOK_T3_COL;

  const TITLE_ROW = 1, META_ROW = 2, LESSON_ID_ROW = 3, HEADER_ROW = 4, FIRST_DATA_ROW = 5;

  // Title
  ws.mergeCells(TITLE_ROW, NUM_COL, TITLE_ROW, LAST_COL);
  const tc = ws.getCell(TITLE_ROW, NUM_COL);
  tc.value = className;
  tc.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GROUP_TITLE } };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(TITLE_ROW).height = 28;

  // Metadata (hidden)
  ws.getCell(META_ROW, 1).value = `class_id=${classId}`;
  ws.getCell(META_ROW, 2).value = `branch_id=${branchId}`;
  ws.getCell(META_ROW, 3).value = `has_books=${hasBooks}`;
  ws.getRow(META_ROW).hidden = true;

  // Lesson IDs (hidden)
  ws.getCell(LESSON_ID_ROW, NUM_COL).value = 'lesson_id→';
  for (let i = 0; i < lessons.length; i++) {
    ws.getCell(LESSON_ID_ROW, FIRST_LESSON_COL + i).value = lessons[i].id;
  }
  ws.getRow(LESSON_ID_ROW).hidden = true;

  // Headers
  ws.getRow(HEADER_ROW).height = 45;
  setH(ws, HEADER_ROW, NUM_COL, '#', COLOR_HEADER_BG); ws.getColumn(NUM_COL).width = 5;
  setH(ws, HEADER_ROW, NAME_COL, 'الاسم واللقب', COLOR_HEADER_BG); ws.getColumn(NAME_COL).width = 30;
  for (let i = 0; i < lessons.length; i++) {
    const col = FIRST_LESSON_COL + i;
    const d = lessons[i].startsAt;
    setH(ws, HEADER_ROW, col, `${pad(d.getDate())}/${pad(d.getMonth()+1)}\n${d.getFullYear()}`, COLOR_DATE_BG);
    ws.getColumn(col).width = 7;
  }
  setH(ws, HEADER_ROW, BOOK_T1_COL, 'كتاب\nت 1', COLOR_BOOK_BG); ws.getColumn(BOOK_T1_COL).width = 7;
  setH(ws, HEADER_ROW, BOOK_T2_COL, 'كتاب\nت 2', COLOR_BOOK_BG); ws.getColumn(BOOK_T2_COL).width = 7;
  setH(ws, HEADER_ROW, BOOK_T3_COL, 'كتاب\nت 3', COLOR_BOOK_BG); ws.getColumn(BOOK_T3_COL).width = 7;

  // Pre-fill some demo data (X pattern from the screenshot)
  const demoPresent: Record<number, number[]> = {
    0: [0, 1, 2, 3, 4, 5],       // student 0: present lessons 0-5
    1: [0, 1, 3, 4, 6, 7],
    2: [1, 2, 4, 5, 8, 9],
    3: [0, 2, 3, 5, 7],
    4: [0, 1, 2, 3, 4, 5, 6],
    5: [1, 2, 5, 6, 8],
    6: [0, 3, 4, 7, 8, 9],
    7: [2, 3, 5, 6, 7, 9],
    8: [0, 1, 4, 5, 8],
    9: [1, 2, 3, 6, 7, 9],
  };
  const demoBooks: Record<number, [number, number, number]> = {
    0: [1, 0, 0], 1: [1, 0, 0], 2: [1, 0, 0],
    3: [1, 0, 0], 4: [0, 0, 0], 5: [1, 0, 0],
    6: [1, 0, 0], 7: [1, 0, 0], 8: [0, 0, 0],
    9: [1, 0, 0],
  };

  // Student rows
  for (let s = 0; s < students.length; s++) {
    const student = students[s];
    const rowIdx = FIRST_DATA_ROW + s;
    const row = ws.getRow(rowIdx);
    row.height = 18;
    const rowBg = s % 2 === 0 ? 'FFFFFFFF' : 'FFF0F5FF';

    // # cell
    const nc = row.getCell(NUM_COL);
    nc.value = student.globalNumber;
    nc.font = { size: 9, color: { argb: '666666' } };
    nc.alignment = { horizontal: 'center', vertical: 'middle' };
    nc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_STUDENT_BG } };
    setBorder(nc);

    // Name cell
    const nameCell = row.getCell(NAME_COL);
    nameCell.value = student.name;
    nameCell.font = { bold: true, size: 10 };
    nameCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_STUDENT_BG } };
    (nameCell as any).note = { texts: [{ text: `student_id:${student.id}` }] };
    setBorder(nameCell);

    // Lesson cells with demo data
    const presentSet = new Set(demoPresent[s] ?? []);
    for (let l = 0; l < lessons.length; l++) {
      const col = FIRST_LESSON_COL + l;
      const cell = row.getCell(col);
      const present = presentSet.has(l);
      cell.value = present ? 1 : 0;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 11, bold: true, color: { argb: present ? 'FFFFFFFF' : '999999' } };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: present ? 'FF70AD47' : rowBg },
      };
      setBorder(cell);
    }

    // Book cells with demo data
    const [b1, b2, b3] = demoBooks[s] ?? [0, 0, 0];
    const bookVals = [b1, b2, b3];
    for (let bi = 0; bi < 3; bi++) {
      const cell = row.getCell(BOOK_T1_COL + bi);
      const got = bookVals[bi] === 1;
      cell.value = bookVals[bi];
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 11, bold: true, color: { argb: got ? 'FFFFFFFF' : '999999' } };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: got ? 'FFED7D31' : 'FFFFF4E8' },
      };
      setBorder(cell);
    }
  }

  // Legend row (below students)
  const legendRow = FIRST_DATA_ROW + students.length + 1;
  ws.mergeCells(legendRow, NUM_COL, legendRow, LAST_COL);
  const lc = ws.getCell(legendRow, NUM_COL);
  lc.value = '🟢 1 = حاضر (Présent)    ⬜ 0 = غائب (Absent)    🟠 1 = استلم الكتاب (Livre reçu)    — هذا ملف عينة توضيحية';
  lc.font = { italic: true, size: 9, color: { argb: '666666' } };
  lc.alignment = { horizontal: 'center' };

  // Freeze panes
  ws.views = [{
    state: 'frozen',
    xSplit: NAME_COL,
    ySplit: HEADER_ROW,
    topLeftCell: `${colLetter(FIRST_LESSON_COL)}${FIRST_DATA_ROW}`,
    activeCell: `${colLetter(FIRST_LESSON_COL)}${FIRST_DATA_ROW}`,
  }];

  const outPath = path.join(OUTPUT_DIR, 'DEMO_SAMPLE_TEMPLATE.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Demo template created: ${outPath}`);
  console.log('   Open it in Excel to see what the real templates will look like.\n');
}

function setH(ws: ExcelJS.Worksheet, row: number, col: number, value: string, bg: string) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  setBorder(cell);
}
function setBorder(cell: ExcelJS.Cell) {
  const s: ExcelJS.BorderStyle = 'thin';
  const c = { argb: 'FFB8CCE4' };
  cell.border = { top:{style:s,color:c}, left:{style:s,color:c}, bottom:{style:s,color:c}, right:{style:s,color:c} };
}
function pad(n: number) { return String(n).padStart(2, '0'); }
function colLetter(col: number): string {
  let r = '';
  while (col > 0) { const rem = (col-1)%26; r = String.fromCharCode(65+rem)+r; col=Math.floor((col-1)/26); }
  return r;
}

main().catch(console.error);
