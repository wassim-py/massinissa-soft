/**
 * scripts/generate-books-template.ts
 * ═══════════════════════════════════════════════════════════════════
 * Generates an Excel template to enter book payments (vouchers)
 * and physical book copy distributions.
 *
 * One Excel file per branch (or combined):
 *   data/books/BOOKS_ECOLE.xlsx
 *
 * Columns for each student:
 *   - Global # | Student Name | Class / Group
 *   - Book Voucher # (رقم وصل دفع الكتاب)
 *   - Book Amount (المبلغ e.g. 700)
 *   - Payment Date (تاريخ الدفع DD/MM/YYYY)
 *   - Trimester (الفصل e.g. T1, T2, T3)
 *   - Received Copy? (استلم النسخة؟ 1 = نعم / 0 = لا)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { prisma } from './lib/db';

const OUTPUT_DIR = path.join(__dirname, '../data/books');

async function main() {
  const branchFilter = (() => {
    const idx = process.argv.indexOf('--branch');
    return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 1; // Default to branch 1 (ECOLE)
  })();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const branch = await prisma.branch.findUnique({
    where: { id: branchFilter },
    include: {
      classes: {
        where: {
          enrollments: { some: {} },
        },
        include: {
          level: true,
          teacher: true,
          enrollments: {
            include: {
              student: { select: { id: true, name: true, globalNumber: true } },
            },
            orderBy: { enrolledAt: 'asc' },
          },
        },
      },
    },
  });

  if (!branch) {
    console.log(`Branch ${branchFilter} not found.`);
    await prisma.$disconnect();
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Import System';
  const ws = wb.addWorksheet('دفع واستلام الكتب', { views: [{ rightToLeft: false }] });

  // Column definitions
  ws.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'الاسم واللقب', key: 'name', width: 28 },
    { header: 'الفوج / القسم', key: 'class', width: 22 },
    { header: 'رقم وصل دفع الكتاب (Voucher #)', key: 'voucherNum', width: 22 },
    { header: 'المبلغ (Amount)', key: 'amount', width: 14 },
    { header: 'تاريخ الدفع (DD/MM/YYYY)', key: 'date', width: 18 },
    { header: 'الفصل (T1 / T2 / T3)', key: 'trimester', width: 15 },
    { header: 'استلم النسخة؟ (1 = نعم / 0 = لا)', key: 'received', width: 20 },
  ];

  // Format Header row
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  let rowIdx = 2;
  for (const cls of branch.classes) {
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

    for (const student of students) {
      const row = ws.getRow(rowIdx);
      row.height = 20;

      row.getCell(1).value = student.globalNumber;
      row.getCell(2).value = student.name;
      (row.getCell(2) as any).note = { texts: [{ text: `student_id:${student.id}|class_id:${cls.id}` }] };

      row.getCell(3).value = cls.name;
      row.getCell(4).value = ''; // Voucher number to fill
      row.getCell(5).value = ''; // Amount to fill (e.g. 700)
      row.getCell(6).value = ''; // Date (e.g. 01/09/2026)
      row.getCell(7).value = 'T1'; // Default trimester T1
      row.getCell(8).value = 0;   // 1 if received, 0 if not

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

      // Borders
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        };
      }

      rowIdx++;
    }
  }

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 3 }];

  const outFile = path.join(OUTPUT_DIR, `BOOKS_${branch.name}.xlsx`);
  await wb.xlsx.writeFile(outFile);

  console.log(`\n✅ Generated books template for ${branch.name}:`);
  console.log(`   ${outFile}`);
  console.log(`   Classes with books: ${branch.classes.length}`);
  console.log(`   Total student rows: ${rowIdx - 2}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
