/**
 * scripts/generate-branch-sample.ts
 * Generates a SAMPLE branch Excel file showing the EXACT structure
 * the import script expects.
 *
 * Open the output file side-by-side with your real Excel file
 * and restructure your real file to match this layout exactly.
 *
 * Run: npx tsx scripts/generate-branch-sample.ts
 * Output: data/SAMPLE_BRANCH_TEMPLATE.xlsx
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';

const OUT_DIR = path.join(__dirname, '../data');
const OUT_FILE = path.join(OUT_DIR, 'SAMPLE_BRANCH_TEMPLATE.xlsx');

// ── Colors ────────────────────────────────────────────────────────
const C = {
  groupTitle:     'FF1F3864', // dark navy  — group name row
  groupTitleFg:   'FFFFFFFF',
  colHeader:      'FF2E75B6', // blue       — column header row
  colHeaderFg:    'FFFFFFFF',
  nameCell:       'FFFFFF00', // yellow     — student name cells (top row, merged)
  nameCellFg:     'FF000000',
  amountCell:     'FFE2EFDA', // light green — amount cells (top row)
  voucherCell:    'FFDDEEFF', // light blue — BON voucher cells (bottom row)
  phoneCell:      'FFFCE4D6', // peach      — phone cells
  annotBg:        'FFFFF0CC', // pale yellow — annotation cells
  annotFg:        'FF843C0C', // dark orange — annotation text
  legendBg:       'FFF2F2F2',
  empty:          'FFFFFFFF',
  border:         'FF9BC2E6',
  warningBg:      'FFFF0000',
  warningFg:      'FFFFFFFF',
};

// ── Sample data ───────────────────────────────────────────────────
const GROUPS: Array<{
  sheet: string;       // tab / level name — must match a Level in the DB
  groupName: string;   // merged cell above the table — must match a Class name in DB
  hasBooks: boolean;
  students: Array<{
    name: string;
    phone: string;
    inscription: { amount: string; bon: string };
    months: Array<{ amount: string; bon: string } | null>; // null = no payment that month
  }>;
}> = [
  // ─────────────────────────────────────────────────────────────────
  // SHEET 1: BAC level — two groups
  // ─────────────────────────────────────────────────────────────────
  {
    sheet: 'BAC',
    groupName: 'بن يحي BAC',          // ← must match exactly a class name in DB
    hasBooks: false,
    students: [
      {
        name: 'بن عمارة هبة الله',
        phone: '06 61 42 80 85',
        inscription: { amount: '250', bon: 'BON 12(04/08/2026)' },
        months: [
          { amount: '2500', bon: 'BON 12(04/08/2026)' },
          { amount: '2500+500', bon: 'BON 19+204(05+16/08+09/2026)' },
          { amount: '2500', bon: 'BON 38(09/08/2026)' },
          null,
          null,
          null,
        ],
      },
      {
        name: 'غربي جمالة',
        phone: '06 59 87 49 89 / 06 97 23 28 88',
        inscription: { amount: '250', bon: 'BON 12(04/08/2026)' },
        months: [
          { amount: '2500+500', bon: 'BON 19+204(05+16/08+09/2026)' },
          { amount: '2500', bon: 'BON 20(05/08/2026)' },
          null,
          null,
          null,
          null,
        ],
      },
      {
        name: 'بالعلي ندى',
        phone: '07 70 39 30 17',
        inscription: { amount: '250', bon: 'BON 19(05/08/2026)' },
        months: [
          { amount: '3000', bon: 'BON 58(17/08/2026)' },
          { amount: '3000', bon: 'BON 62(18/08/2026)' },
          { amount: '3000', bon: 'BON 82(24/08/2026)' },
          null,
          null,
          null,
        ],
      },
      {
        name: 'قداوي ناديين',
        phone: '06 71 15 72 63',
        inscription: { amount: '250', bon: 'BON 20(05/08/2026)' },
        months: [
          null,
          { amount: '2500', bon: 'BON 48(09/09/2026)' },
          null,
          null,
          null,
          null,
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // SHEET 1: BAC level — second group (same sheet, below first group)
  // ─────────────────────────────────────────────────────────────────
  {
    sheet: 'BAC',
    groupName: 'عمير علمي',            // ← second group on same BAC sheet
    hasBooks: false,
    students: [
      {
        name: 'لوصيف أمينة وصال',
        phone: '05 54 07 01 02',
        inscription: { amount: '250', bon: 'BON 48(09/09/2026)' },
        months: [
          { amount: '2500', bon: 'BON 51(12/08/2026)' },
          null,
          null,
          null,
          null,
          null,
        ],
      },
      {
        name: 'حميص هبة الرحمان',
        phone: '06 72 15 69 09 / 07 78 29 25 86',
        inscription: { amount: '250', bon: 'BON 51(12/08/2026)' },
        months: [
          { amount: '2500+500', bon: 'BON 51+185(12+13/08+09/2026)' },
          null,
          null,
          null,
          null,
          null,
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // SHEET 2: 4AM level — one group WITH books
  // ─────────────────────────────────────────────────────────────────
  {
    sheet: '4AM',
    groupName: 'بوعبلو BEM فوج 1',     // ← matches class in DB (level: 4AM / BEM)
    hasBooks: true,                     // ← this group has book fee columns
    students: [
      {
        name: 'جبريلي آية الرحمان',
        phone: '07 77 19 04 86 / 07 72 80 25 54',
        inscription: { amount: '250', bon: 'BON 58(17/08/2026)' },
        months: [
          { amount: '1500', bon: 'BON 58(17/08/2026)' },
          { amount: '1500', bon: 'BON 62(18/08/2026)' },
          null,
          null,
          null,
          null,
        ],
      },
      {
        name: 'سليبي سراء',
        phone: '06 62 88 89 09',
        inscription: { amount: '250', bon: 'BON 62(18/08/2026)' },
        months: [
          { amount: '1500', bon: 'BON 82(24/08/2026)' },
          null,
          null,
          null,
          null,
          null,
        ],
      },
    ],
  },
];

// ── Month column headers ──────────────────────────────────────────
const MONTH_HEADERS = [
  'الشهر 01', 'الشهر 02', 'الشهر 03',
  'الشهر 04', 'الشهر 05', 'الشهر 06',
  'الشهر 07', 'الشهر 08', 'الشهر 09',
  'الشهر 10', 'الشهر 11', 'الشهر 12',
];
const NUM_MONTHS_IN_SAMPLE = 6; // show 6 months in sample (real file can have up to 12)

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Import — Branch Sample';
  wb.created = new Date();

  // Group groups by sheet
  const bySheet = new Map<string, typeof GROUPS>();
  for (const g of GROUPS) {
    if (!bySheet.has(g.sheet)) bySheet.set(g.sheet, []);
    bySheet.get(g.sheet)!.push(g);
  }

  // ── Create LEGEND sheet first ─────────────────────────────────
  createLegendSheet(wb);

  // ── Create one sheet per level ────────────────────────────────
  for (const [sheetName, groups] of bySheet.entries()) {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ rightToLeft: true }],  // RTL — Arabic layout
    });
    setSheetWidths(ws);

    let currentRow = 1;

    for (const group of groups) {
      // Add spacing between groups (except before the first one)
      if (currentRow > 1) currentRow += 2;

      currentRow = writeGroup(ws, group, currentRow);
    }
  }

  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`\n✅ Sample branch template created:`);
  console.log(`   ${OUT_FILE}`);
  console.log(`\n📖 Open this file alongside your real Excel file.`);
  console.log(`   The LEGEND sheet explains every color and cell.`);
  console.log(`   Restructure your real file to match this layout exactly.\n`);
}

// ── Write one group table to the worksheet ────────────────────────
function writeGroup(
  ws: ExcelJS.Worksheet,
  group: typeof GROUPS[0],
  startRow: number
): number {
  // Column positions:
  // 1=Name, 2=Phone, 3=Inscription, 4..N=Months, [N+1=BookT1, N+2=BookT2, N+3=BookT3]
  const NAME_COL  = 1;
  const PHONE_COL = 2;
  const INS_COL   = 3;
  const FIRST_MONTH_COL = 4;
  const LAST_MONTH_COL  = FIRST_MONTH_COL + NUM_MONTHS_IN_SAMPLE - 1;
  const BOOK_T1_COL = LAST_MONTH_COL + 1;
  const BOOK_T2_COL = LAST_MONTH_COL + 2;
  const BOOK_T3_COL = LAST_MONTH_COL + 3;
  const LAST_COL = group.hasBooks ? BOOK_T3_COL : LAST_MONTH_COL;

  let row = startRow;

  // ── Row A: Annotation (not in real file — just for explanation) ──
  {
    ws.mergeCells(row, NAME_COL, row, LAST_COL);
    const cell = ws.getCell(row, NAME_COL);
    cell.value = `⬇  GROUP TABLE — one table per group per sheet  ⬇   Group name: "${group.groupName}"   Sheet name = level: "${ws.name}"${group.hasBooks ? '   [This group HAS book fee columns]' : ''}`;
    cell.font = { bold: true, size: 9, color: { argb: C.annotFg } };
    cell.fill = fill(C.annotBg);
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    ws.getRow(row).height = 16;
    row++;
  }

  // ── Row B: Group name (merged cell — the group header) ───────────
  {
    ws.mergeCells(row, NAME_COL, row, LAST_COL);
    const cell = ws.getCell(row, NAME_COL);
    cell.value = group.groupName;
    cell.font = { bold: true, size: 14, color: { argb: C.groupTitleFg } };
    cell.fill = fill(C.groupTitle);
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    setBorder(cell, 'medium');
    ws.getRow(row).height = 26;
    row++;
  }

  // ── Row C: Column headers ─────────────────────────────────────────
  {
    const headerRow = ws.getRow(row);
    headerRow.height = 30;

    const headers: Array<[number, string]> = [
      [NAME_COL,  'الاسم واللقب'],      // ← MUST contain "الاسم"
      [PHONE_COL, 'رقم الهاتف'],        // ← MUST contain "الهاتف"
      [INS_COL,   'حقوق التسجيل'],      // ← MUST contain "التسجيل"
      ...MONTH_HEADERS.slice(0, NUM_MONTHS_IN_SAMPLE).map((h, i): [number, string] =>
        [FIRST_MONTH_COL + i, h]        // ← MUST contain "شهر"
      ),
    ];
    if (group.hasBooks) {
      headers.push(
        [BOOK_T1_COL, 'رسوم الكتاب ت1'],
        [BOOK_T2_COL, 'رسوم الكتاب ت2'],
        [BOOK_T3_COL, 'رسوم الكتاب ت3'],
      );
    }

    for (const [col, label] of headers) {
      const cell = headerRow.getCell(col);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: C.colHeaderFg } };
      cell.fill = fill(C.colHeader);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
      setBorder(cell, 'medium');
    }
    row++;
  }

  // ── Rows D+: Students (2 rows per student) ───────────────────────
  for (const student of group.students) {
    const topRow    = row;
    const bottomRow = row + 1;

    // Merge the name cell across both rows
    ws.mergeCells(topRow, NAME_COL, bottomRow, NAME_COL);
    const nameCell = ws.getCell(topRow, NAME_COL);
    nameCell.value = student.name;
    nameCell.font = { bold: true, size: 11, color: { argb: C.nameCellFg } };
    nameCell.fill = fill(C.nameCell);
    nameCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
    setBorder(nameCell, 'thin');

    // Phone (top row only)
    const phoneCell = ws.getCell(topRow, PHONE_COL);
    phoneCell.value = student.phone;
    phoneCell.font = { size: 9 };
    phoneCell.fill = fill(C.phoneCell);
    phoneCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setBorder(phoneCell, 'thin');
    // Bottom phone cell — empty (nothing merged, just blank)
    const phoneCellBot = ws.getCell(bottomRow, PHONE_COL);
    phoneCellBot.fill = fill(C.phoneCell);
    setBorder(phoneCellBot, 'thin');

    // Inscription (top = amount, bottom = BON)
    writePaymentCell(ws, topRow, bottomRow, INS_COL,
      student.inscription.amount, student.inscription.bon);

    // Month columns
    for (let m = 0; m < NUM_MONTHS_IN_SAMPLE; m++) {
      const col = FIRST_MONTH_COL + m;
      const payment = student.months[m];
      if (payment) {
        writePaymentCell(ws, topRow, bottomRow, col, payment.amount, payment.bon);
      } else {
        // Empty payment cell pair
        const t = ws.getCell(topRow, col);
        const b = ws.getCell(bottomRow, col);
        t.fill = fill(C.empty); setBorder(t, 'thin');
        b.fill = fill(C.empty); setBorder(b, 'thin');
      }
    }

    // Book fee columns (if applicable) — just example amounts
    if (group.hasBooks) {
      const bookAmounts = ['700', '', ''];
      const bookBons    = ['BON 90(01/09/2026)', '', ''];
      for (let bi = 0; bi < 3; bi++) {
        const col = BOOK_T1_COL + bi;
        if (bookAmounts[bi]) {
          writePaymentCell(ws, topRow, bottomRow, col, bookAmounts[bi], bookBons[bi]);
        } else {
          const t = ws.getCell(topRow, col);
          const b = ws.getCell(bottomRow, col);
          t.fill = fill(C.empty); setBorder(t, 'thin');
          b.fill = fill(C.empty); setBorder(b, 'thin');
        }
      }
    }

    ws.getRow(topRow).height    = 18;
    ws.getRow(bottomRow).height = 18;
    row += 2;
  }

  return row;
}

// ── Write a payment cell pair (top=amount, bottom=BON) ────────────
function writePaymentCell(
  ws: ExcelJS.Worksheet,
  topRow: number, bottomRow: number, col: number,
  amount: string, bon: string,
) {
  const topCell = ws.getCell(topRow, col);
  topCell.value = amount;
  topCell.font  = { bold: true, size: 10 };
  topCell.fill  = fill(C.amountCell);
  topCell.alignment = { horizontal: 'center', vertical: 'middle' };
  setBorder(topCell, 'thin');

  const botCell = ws.getCell(bottomRow, col);
  botCell.value = bon;
  botCell.font  = { size: 8, color: { argb: '220000AA' } };
  botCell.fill  = fill(C.voucherCell);
  botCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  setBorder(botCell, 'thin');
}

// ── Create the legend / instructions sheet ────────────────────────
function createLegendSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('📖 READ ME FIRST', {
    views: [{ rightToLeft: false }],
  });
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 55;
  ws.getColumn(3).width = 40;

  const rows: Array<[string, string, string, string?, string?]> = [
    // [col1, col2, col3, bgColor?, fgColor?]
    ['SAMPLE BRANCH FILE — HOW IT MUST BE STRUCTURED', '', '', 'FF1F3864', 'FFFFFFFF'],
    ['', '', '', C.legendBg],
    ['SHEET NAMES', 'One sheet per school level', 'Tab names: BAC  |  1AS  |  2AS  |  4AM  |  BEM  |  3AP  |  …', 'FFDDEBF7'],
    ['', 'Must match a Level in the database', 'Run npm run db:check to see all level names', C.legendBg],
    ['', '', '', C.legendBg],
    ['GROUP NAME ROW', 'One merged cell spanning all columns', 'Must match (or be similar to) a Class name in the database', 'FF' + C.groupTitle.slice(2)],
    ['(dark navy row)', 'Appears once per group, above the header row', 'Run npm run db:check to see all class names', C.legendBg],
    ['', '', '', C.legendBg],
    ['COLUMN HEADER ROW', 'Row immediately after the group name row', 'Script detects it by looking for "الاسم" AND "الهاتف" keywords', 'FF' + C.colHeader.slice(2)],
    ['(blue row)', 'Column order can be RTL or LTR — script auto-detects', '', C.legendBg],
    ['', '', '', C.legendBg],
    ['REQUIRED COLUMNS', 'الاسم واللقب — Student full name', 'MUST contain the word "الاسم" in the header', 'FFFFFF00'],
    ['', 'رقم الهاتف — Phone number(s)', 'MUST contain "الهاتف" in the header — separate multiple numbers with / or -', 'FFFCE4D6'],
    ['', 'حقوق التسجيل — Inscription fee', 'MUST contain "التسجيل" or "تسجيل" in the header', 'FFE2EFDA'],
    ['', 'الشهر 01..12 — Monthly tuition', 'MUST contain "شهر" in the header', 'FFDDEEFF'],
    ['', 'رسوم الكتاب ت1/ت2/ت3 — Book fee (optional)', 'Only for classes with hasBooks=true. Any header with "كتاب" works', C.legendBg],
    ['', '', '', C.legendBg],
    ['STUDENT ROWS', 'Each student = EXACTLY 2 stacked rows', 'Do NOT use 1 row or 3+ rows per student', 'FFFFFF00'],
    ['', 'TOP ROW: contains the amount (e.g. 2500, 250, 2500+500)', '"2500+500" means two payments in one cycle', 'FFE2EFDA'],
    ['', 'BOTTOM ROW: contains the BON voucher code', 'BON 38(09/08/2026) or BON 19+204(05+16/08+09/2026)', 'FFDDEEFF'],
    ['', 'NAME CELL: merged across both top+bottom rows', 'In Excel: select the 2 name cells → Merge & Center', 'FFFFFF00'],
    ['', '', '', C.legendBg],
    ['PHONE FORMAT', '06 61 42 80 85', 'One number: assign to student', C.legendBg],
    ['', '06 61 42 80 85 / 07 78 29 25 86', 'First = student, rest = parents (separated by / or -)', C.legendBg],
    ['', '', '', C.legendBg],
    ['VOUCHER FORMATS', 'BON 38(09/08/2026)', 'Single payment: BON [number]([DD/MM/YYYY])', C.legendBg],
    ['', 'BON 19+204(05+16/08+09/2026)', 'Two payments: BON [n1]+[n2]([d1]+[d2]/[m1]+[m2]/[yyyy])', C.legendBg],
    ['', 'BON 48+79(09+04/09/2026)', 'Two payments same month: BON [n1]+[n2]([d1]+[d2]/[m]/[yyyy])', C.legendBg],
    ['', '2500+500 (amount row)', 'Amount "2500+500" = two amounts matching the two BON numbers', C.legendBg],
    ['', '', '', C.legendBg],
    ['SPACING BETWEEN GROUPS', '2 or more empty rows between group tables', 'The script stops reading a group when it finds 2+ consecutive empty name cells', 'FFFFE0E0'],
    ['', 'Every group on the same sheet (level) is parsed', 'No limit on how many groups per sheet', C.legendBg],
    ['', '', '', C.legendBg],
    ['WHAT TO CHECK', '1. Sheet names match level names in DB', 'npm run db:check  →  LEVELS table', 'FFFFE0E0'],
    ['', '2. Group name rows match class names in DB', 'npm run db:check  →  CLASSES/GROUPS table', 'FFFFE0E0'],
    ['', '3. Column headers contain the Arabic keywords', 'الاسم  |  الهاتف  |  التسجيل  |  شهر', 'FFFFE0E0'],
    ['', '4. Each student is exactly 2 rows with merged name', 'Check by selecting the name cell — it should span 2 rows', 'FFFFE0E0'],
    ['', '5. Filename contains the branch name', 'ECOLE.xlsx  |  ANNEX.xlsx  |  AMPHI.xlsx', 'FFFFE0E0'],
  ];

  for (const [i, [a, b, c, bg, fg]] of rows.entries()) {
    const rowNum = i + 1;
    ws.getRow(rowNum).height = 20;

    for (const [colIdx, val] of [[1, a], [2, b], [3, c]] as [number, string][]) {
      const cell = ws.getCell(rowNum, colIdx);
      cell.value = val;
      const isTitleRow = i === 0;
      cell.font = {
        bold: isTitleRow || a.includes('WHAT TO CHECK') || colIdx === 1,
        size: isTitleRow ? 12 : 9,
        color: { argb: fg ?? (isTitleRow ? 'FFFFFFFF' : 'FF000000') },
      };
      if (bg) cell.fill = fill(bg);
      cell.alignment = { vertical: 'middle', wrapText: true, readingOrder: 'ltr' };
    }
  }
}

// ── Column widths ─────────────────────────────────────────────────
function setSheetWidths(ws: ExcelJS.Worksheet) {
  ws.getColumn(1).width = 28;  // Name
  ws.getColumn(2).width = 32;  // Phone
  ws.getColumn(3).width = 18;  // Inscription
  for (let i = 4; i <= 16; i++) {
    ws.getColumn(i).width = 16; // Month columns
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
}

function setBorder(cell: ExcelJS.Cell, style: ExcelJS.BorderStyle = 'thin') {
  const color = { argb: C.border };
  cell.border = {
    top:    { style, color },
    left:   { style, color },
    bottom: { style, color },
    right:  { style, color },
  };
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
