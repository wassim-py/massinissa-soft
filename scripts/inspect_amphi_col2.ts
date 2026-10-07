import * as ExcelJS from 'exceljs';

async function inspectCol2() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/2027 AMPHI.xlsx');
  const ws = wb.getWorksheet('BAC')!;

  console.log('=== BAC Col 1 to 5, Rows 1 to 35 ===');
  for (let r = 1; r <= 35; r++) {
    const row = ws.getRow(r);
    const c1 = row.getCell(1).value;
    const c2 = row.getCell(2).value;
    const c3 = row.getCell(3).value;
    const c4 = row.getCell(4).value;
    console.log(`R${r.toString().padStart(2)}: C1="${c1 ?? ''}" | C2="${c2 ?? ''}" | C3="${c3 ?? ''}" | C4="${c4 ?? ''}"`);
  }
}

inspectCol2().catch(console.error);
