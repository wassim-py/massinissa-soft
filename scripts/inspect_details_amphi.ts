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

async function inspectDetails() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/2027 AMPHI.xlsx');

  const wsBac = wb.getWorksheet('BAC')!;
  console.log('=== BAC Col 2: Check all names down to row 226 ===');
  let col2Names = 0;
  for (let r = 7; r <= wsBac.rowCount; r++) {
    const val = getCellStr(wsBac.getRow(r).getCell(2));
    if (val && !val.includes('الاسم') && isNaN(Number(val))) {
      col2Names++;
      if (col2Names <= 5 || col2Names >= 65 || r >= 150) {
        console.log(`R${r}: "${val}"`);
      }
    }
  }
  console.log(`Total non-empty names found in Col 2: ${col2Names} (expected ~70 if paired)`);

  console.log('\n=== BAC Col 93: Rows 1 to 10 ===');
  for (let r = 1; r <= 8; r++) {
    const vals = [];
    for (let c = 90; c <= 98; c++) {
      const v = getCellStr(wsBac.getRow(r).getCell(c));
      if (v) vals.push(`C${c}="${v}"`);
    }
    if (vals.length) console.log(`R${r}: ${vals.join(' | ')}`);
  }

  const ws1as = wb.getWorksheet('1 AS')!;
  console.log('\n=== 1 AS Col 17: Rows 1 to 10 ===');
  for (let r = 1; r <= 8; r++) {
    const vals = [];
    for (let c = 14; c <= 22; c++) {
      const v = getCellStr(ws1as.getRow(r).getCell(c));
      if (v) vals.push(`C${c}="${v}"`);
    }
    if (vals.length) console.log(`R${r}: ${vals.join(' | ')}`);
  }
}

import { PrismaClient } from '@prisma/client';

async function checkDb() {
  const prisma = new PrismaClient();
  try {
    const classes = await prisma.class.findMany({
      include: { branch: true, teacher: true }
    });
    console.log('\n=== Database Classes Matching دراجي or similar ===');
    for (const c of classes) {
      if (c.name.includes('دراجي') || (c.teacher && c.teacher.name.includes('دراجي'))) {
        console.log(`Branch: ${c.branch?.name} (ID: ${c.branchId}) | Class ID: ${c.id} | Class Name: ${c.name} | Teacher: ${c.teacher?.name}`);
      }
    }
    console.log('\n=== All Branch 3 (AMPHI) Classes in DB ===');
    for (const c of classes.filter(c => c.branchId === 3)) {
      console.log(`ID: ${c.id} | Name: "${c.name}" | Teacher: ${c.teacher?.name} | Grade: ${c.grade}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function run() {
  await inspectDetails();
  await checkDb();
}

run().catch(console.error);
