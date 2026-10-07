import * as ExcelJS from 'exceljs';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/import/ECOLE.xlsx');
  console.log('ECOLE import sheets:', wb.worksheets.map(w => w.name));
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= ws.rowCount; r++) {
      const v = ws.getRow(r).getCell(1).value?.toString() || '';
      if (v.includes('دراجي') || v.includes('متاني')) {
        console.log(`Found in ECOLE.xlsx sheet "${ws.name}" R${r}: "${v}"`);
      }
    }
  }
}

main().catch(console.error);
