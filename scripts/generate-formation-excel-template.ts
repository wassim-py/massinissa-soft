/**
 * scripts/generate-formation-excel-template.ts
 * ═══════════════════════════════════════════════════════════════════
 * Queries all formation classes from the real database and generates
 * a structured Excel file for each branch (e.g. data/ANNEX_FORMATIONS.xlsx)
 * ready for the user to fill with:
 *   - Student names & phone numbers
 *   - Registration fee vouchers (FI / حقوق التسجيل)
 *   - Book vouchers (Livre / كتاب)
 *   - Cycle/Level tuition vouchers (Cycle / الشهر / F NV)
 *
 * Fully compatible with scripts/import-excel.ts!
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { prisma } from './lib/db';

const DATA_DIR = path.join(__dirname, '../data');
const SLOTS_PER_CLASS = 20; // 20 student slots per formation class

// Styling constants
const COLOR_BANNER_BG = 'FF1F3864'; // Deep navy
const COLOR_BANNER_FG = 'FFFFFFFF'; // White text
const COLOR_HEADER_BG = 'FF2E75B6'; // Classic blue
const COLOR_HEADER_FG = 'FFFFFFFF'; // White text
const COLOR_STUDENT_ROW_EVEN = 'FFFFFFFF'; // White
const COLOR_STUDENT_ROW_ODD  = 'FFF2F7FA'; // Very subtle cool tint
const COLOR_HINT_FG = 'FF7F7F7F'; // Gray hint text
const COLOR_BORDER = 'FFD9D9D9'; // Light gray border

function setBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top:    { style: 'thin', color: { argb: COLOR_BORDER } },
    left:   { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    right:  { style: 'thin', color: { argb: COLOR_BORDER } },
  };
}

async function main() {
  console.log('🔍 Querying formation classes from the database...');

  const classes = await prisma.class.findMany({
    where: { isFormation: true },
    include: {
      branch: true,
      FormationLevel: { include: { Language: true } },
      teacher: true,
      enrollments: {
        include: {
          student: true,
        },
      },
    },
    orderBy: [
      { branchId: 'asc' },
      { FormationLevel: { languageId: 'asc' } },
      { FormationLevel: { levelNumber: 'asc' } },
      { name: 'asc' },
    ],
  });

  if (classes.length === 0) {
    console.log('⚠ No formation classes found in database.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${classes.length} formation class(es).`);

  // Group classes by branch
  const branchMap = new Map<number, typeof classes>();
  for (const c of classes) {
    const list = branchMap.get(c.branchId) ?? [];
    list.push(c);
    branchMap.set(c.branchId, list);
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  for (const [branchId, branchClasses] of branchMap.entries()) {
    const branchName = branchClasses[0]?.branch.name ?? `Branch_${branchId}`;
    const filename = `${branchName}_FORMATIONS.xlsx`;
    const filePath = path.join(DATA_DIR, filename);

    console.log(`\n📋 Generating: ${filename} (${branchClasses.length} formation classes)...`);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'School Management System';
    wb.created = new Date();

    // Group classes by Language / Track into sheets
    const languageMap = new Map<string, typeof classes>();
    for (const c of branchClasses) {
      const langName = c.FormationLevel?.Language?.name ?? 'Formations';
      const list = languageMap.get(langName) ?? [];
      list.push(c);
      languageMap.set(langName, list);
    }

    for (const [langName, langClasses] of languageMap.entries()) {
      const sheetName = langName.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
      const ws = wb.addWorksheet(sheetName, {
        views: [{ rightToLeft: true }],
      });

      // Configure columns
      ws.columns = [
        { key: 'col1', width: 6 },   // #
        { key: 'col2', width: 28 },  // Name
        { key: 'col3', width: 20 },  // Phone
        { key: 'col4', width: 15 },  // Inscription
        { key: 'col5', width: 14 },  // Book
        { key: 'col6', width: 14 },  // Month 1
        { key: 'col7', width: 14 },  // Month 2
        { key: 'col8', width: 14 },  // Month 3
        { key: 'col9', width: 14 },  // Month 4
      ];

      let currentRow = 2;

      for (const cls of langClasses) {
        const cyclePrice = Number(cls.pricePerCycle || 4000);
        const bookFee = Number(cls.bookFee || 500);

        // ── 1. Group Title Row ──────────────────────────────────────────
        // The script matches cls.name directly
        const titleRow = ws.getRow(currentRow);
        ws.mergeCells(currentRow, 1, currentRow, 9);
        const bannerCell = ws.getCell(currentRow, 1);
        bannerCell.value = `${cls.name}  [${cls.branch.name}]  (مستحقات الدورة: ${cyclePrice} دج  |  سعر الكتاب: ${bookFee} دج)`;
        bannerCell.font = { bold: true, size: 12, color: { argb: COLOR_BANNER_FG } };
        bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BANNER_BG } };
        bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;
        currentRow++;

        // ── 2. Column Header Row ────────────────────────────────────────
        const headerRow = ws.getRow(currentRow);
        headerRow.height = 24;
        const headers = [
          '#',
          'الاسم واللقب',
          'رقم الهاتف',
          'حقوق التسجيل',
          'كتاب ت 1',
          'الشهر 01',
          'الشهر 02',
          'الشهر 03',
          'الشهر 04',
        ];

        headers.forEach((h, idx) => {
          const colNum = idx + 1;
          const cell = ws.getCell(currentRow, colNum);
          cell.value = h;
          cell.font = { bold: true, size: 10, color: { argb: COLOR_HEADER_FG } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          setBorder(cell);
        });
        currentRow++;

        // ── 3. Student Slots (2 stacked rows per student) ───────────────
        const existingStudents = cls.enrollments.map((e) => e.student);
        const totalSlots = Math.max(SLOTS_PER_CLASS, existingStudents.length);

        for (let s = 0; s < totalSlots; s++) {
          const student = existingStudents[s];
          const topRowIdx = currentRow;
          const botRowIdx = currentRow + 1;
          const topRow = ws.getRow(topRowIdx);
          const botRow = ws.getRow(botRowIdx);
          topRow.height = 20;
          botRow.height = 20;

          const slotBg = s % 2 === 0 ? COLOR_STUDENT_ROW_EVEN : COLOR_STUDENT_ROW_ODD;

          // Merge # column across both rows
          ws.mergeCells(topRowIdx, 1, botRowIdx, 1);
          const numCell = ws.getCell(topRowIdx, 1);
          numCell.value = student ? student.globalNumber : (s + 1);
          numCell.font = { size: 9, bold: true, color: { argb: 'FF595959' } };
          numCell.alignment = { horizontal: 'center', vertical: 'middle' };
          numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };
          setBorder(numCell);
          setBorder(ws.getCell(botRowIdx, 1));

          // Merge Name column across both rows
          ws.mergeCells(topRowIdx, 2, botRowIdx, 2);
          const nameCell = ws.getCell(topRowIdx, 2);
          nameCell.value = student ? student.name : '';
          nameCell.font = { bold: true, size: 10 };
          nameCell.alignment = { horizontal: 'right', vertical: 'middle' };
          nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };
          setBorder(nameCell);
          setBorder(ws.getCell(botRowIdx, 2));

          // Phone: top = phone 1, bottom = phone 2
          const phone1Cell = ws.getCell(topRowIdx, 3);
          phone1Cell.value = student?.phone ?? '';
          phone1Cell.font = { size: 9 };
          phone1Cell.alignment = { horizontal: 'center', vertical: 'middle' };
          phone1Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };
          setBorder(phone1Cell);

          const phone2Cell = ws.getCell(botRowIdx, 3);
          phone2Cell.value = '';
          phone2Cell.font = { size: 9 };
          phone2Cell.alignment = { horizontal: 'center', vertical: 'middle' };
          phone2Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };
          setBorder(phone2Cell);

          // Payment columns: 4 (Inscription), 5 (Book), 6 (Month 1), 7 (Month 2), 8 (Month 3), 9 (Month 4)
          for (let col = 4; col <= 9; col++) {
            const amtCell = ws.getCell(topRowIdx, col);
            const bonCell = ws.getCell(botRowIdx, col);

            amtCell.value = '';
            bonCell.value = '';

            amtCell.alignment = { horizontal: 'center', vertical: 'middle' };
            bonCell.alignment = { horizontal: 'center', vertical: 'middle' };

            amtCell.font = { bold: true, size: 10 };
            bonCell.font = { size: 9, color: { argb: 'FF333333' } };

            amtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };
            bonCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slotBg } };

            setBorder(amtCell);
            setBorder(bonCell);
          }

          currentRow += 2;
        }

        // Space between groups
        currentRow += 2;
      }
    }

    // ── Instructions sheet ────────────────────────────────────────────
    const wsInstr = wb.addWorksheet('📖 Instructions', { views: [{ rightToLeft: true }] });
    wsInstr.getColumn(1).width = 85;
    const instructions = [
      ['دليل ملء بيانات تلاميذ ومستحقات التكوين / Guide de remplissage'],
      [''],
      ['1. كل فوج (Class) يحتوي على خانات للتلاميذ (الاسم، الهاتف، حقوق التسجيل، الكتاب، والأشهر/الدورات).'],
      [''],
      ['2. لكل تلميذ سطران مدمجان (Stacked rows) :'],
      ['   → السطر العلوي : اسم التلميذ، رقم الهاتف، والمبالغ المالية (المبلغ بالدينار مثل 4000، 500، 0).'],
      ['   → السطر السفلي : رقم الهاتف الثاني (إن وجد)، ورقم الوصل وتاريخه (Bon & Date).'],
      [''],
      ['3. صيغة كتابة الوصل والتاريخ في السطر السفلي :'],
      ['   → مثال: BON 12 (04/08/2026) أو BON01(15/09/2026) أو 102 01/10/2026'],
      ['   → إذا لم تكن للوصل خانة تاريخ محددة، سيعتبر التاريخ تاريخ اليوم تلقائياً.'],
      [''],
      ['4. مستحقات الكتب وحقوق التسجيل :'],
      ['   → عمود "كتاب ت 1": يُكتب فيه مبلغ الكتاب في السطر العلوي (مثلاً 500) ورقم الوصل في السفلي.'],
      ['   → عمود "حقوق التسجيل": يُكتب فيه مبلغ التسجيل إن وجد أو يُترك فارغاً إذا كان 0.'],
      [''],
      ['5. الأفواج الشاغرة :'],
      ['   → الأفواج التي لم يسجل فيها تلاميذ بعد، اترك سطورها فارغة، وسيقوم النظام بتجاوزها تلقائياً.'],
      [''],
      ['6. بعد ملء الملف وحفظه (Ctrl + S) :'],
      ['   → شغّل أمر استيراد البيانات لدفعها إلى قاعدة البيانات.'],
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
    console.log(`  ✅ Successfully saved: ${filePath}`);

    // Also save directly to data/import directory for immediate importer access
    const importDir = path.join(__dirname, '../data/import');
    if (fs.existsSync(importDir)) {
      const importFilePath = path.join(importDir, filename);
      await wb.xlsx.writeFile(importFilePath);
      console.log(`  ✅ Also copied to: ${importFilePath}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error generating formation template:', err);
  process.exit(1);
});
