import * as ExcelJS from 'exceljs';

function getCellStr(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const v = cell.value;
  if (typeof v === 'object') {
    if ('text' in v) return String(v.text).trim();
    if ('richText' in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((t: any) => t.text ?? '').join('').trim();
    }
    if ('result' in v) return String((v as any).result ?? '').trim();
    return JSON.stringify(v);
  }
  return String(v).trim();
}

import { prisma } from './lib/db';

async function checkDaraji() {
  const classes = await prisma.class.findMany({
    include: { branch: true, teacher: true }
  });
  console.log('=== All Classes in DB matching دراجي or رياضيات ===');
  for (const c of classes) {
    if (c.name.includes('دراجي') || c.teacher?.name.includes('دراجي') || c.name.includes('رياضيات')) {
      console.log(`Branch: ${c.branch?.name} (ID: ${c.branchId}) | Class ID: ${c.id} | Class Name: "${c.name}" | Teacher: ${c.teacher?.name}`);
    }
  }
}

async function inspectProperTables() {
  await checkDaraji();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/2027 AMPHI.xlsx');

  const sheets = ['BAC', '2AS', '1 AS', 'ECOLE', 'annex', 'مطبوعات', 'N° BON'];

  for (const sName of sheets) {
    const s = wb.getWorksheet(sName);
    if (!s) continue;
    console.log(`\n======================================================`);
    console.log(`SHEET: "${s.name}" (rows: ${s.rowCount}, cols: ${s.columnCount})`);
    console.log(`======================================================`);

    // In rows 4 to 9, find columns that have "الاسم"
    const tables = [];
    for (let c = 1; c <= s.columnCount; c++) {
      for (let r = 4; r <= 9; r++) {
        const val = getCellStr(s.getRow(r).getCell(c));
        if (val.includes('الاسم') || val.includes('اللقب')) {
          // Found table header at (r, c)
          // Find title above
          let title = '';
          for (let tr = r - 1; tr >= Math.max(1, r - 4); tr--) {
            for (let tc = Math.max(1, c - 2); tc <= c + 8; tc++) {
              const tv = getCellStr(s.getRow(tr).getCell(tc));
              if (tv && !tv.includes('الاسم') && !title.includes(tv)) {
                title += (title ? ' | ' : '') + tv;
              }
            }
            if (title) break;
          }

          // Scan column headers
          const colHeaders: string[] = [];
          for (let hc = c; hc <= Math.min(s.columnCount, c + 18); hc++) {
            const hv = getCellStr(s.getRow(r).getCell(hc));
            if (hv) colHeaders.push(`[+${hc - c}] ${hv}`);
          }

          // Count students
          let studentCount = 0;
          const sampleStudents: string[] = [];
          for (let sr = r + 1; sr <= s.rowCount; sr += 2) {
            const r1 = s.getRow(sr);
            const r2 = s.getRow(sr + 1);
            const n1 = getCellStr(r1.getCell(c));
            const n2 = getCellStr(r2.getCell(c));
            const name = n1 || n2;

            if (!name || name.includes('الاسم') || !isNaN(Number(name))) {
              const nextName = getCellStr(s.getRow(sr + 2).getCell(c));
              if (!nextName) break;
              continue;
            }

            studentCount++;
            if (sampleStudents.length < 3) sampleStudents.push(name);
          }

          tables.push({ r, c, title, colHeaders, studentCount, sampleStudents });
          break; // move to next column
        }
      }
    }

    console.log(`Tables found in "${s.name}": ${tables.length}`);
    for (const t of tables) {
      console.log(`\n  Col ${t.c} (Header R${t.r}): "${t.title}" -> ${t.studentCount} students`);
      console.log(`    Headers: ${t.colHeaders.slice(0, 10).join(' | ')}`);
      console.log(`    Samples: ${t.sampleStudents.join(', ')}`);
    }
  }
}

inspectProperTables().catch(console.error);
