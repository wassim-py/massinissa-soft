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

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/2027 AMPHI.xlsx');
  
  const ws = wb.getWorksheet('N° BON');
  if (ws) {
    console.log(`\n--- Sheet: N° BON (rows: ${ws.rowCount}) ---`);
    for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
      const vals = [];
      for (let c = 1; c <= 10; c++) {
        const v = getCellStr(ws.getRow(r).getCell(c));
        if (v) vals.push(`C${c}:"${v}"`);
      }
      if (vals.length) console.log(`R${r}: ${vals.join(' | ')}`);
    }
  }
}

main().catch(console.error);
