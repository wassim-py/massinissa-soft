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

async function analyzeOriginal() {
  const wbOrig = new ExcelJS.Workbook();
  await wbOrig.xlsx.readFile('data/2027 AMPHI.xlsx');

  const sheets = ['BAC', '2AS', '1 AS'];
  for (const sName of sheets) {
    const ws = wbOrig.getWorksheet(sName)!;
    console.log(`\n======================================================`);
    console.log(`SHEET: ${sName}`);
    console.log(`======================================================`);

    // Scan row 4-8 for table headers containing 'الاسم'
    for (let c = 1; c <= ws.columnCount; c++) {
      for (let r = 4; r <= 8; r++) {
        const val = getCellStr(ws.getRow(r).getCell(c));
        if (val === 'الاسم واللقب' || val === 'الاسم و اللقب' || val === 'اللقب و الإسم' || val === 'اللقب و الاسم') {
          // Table starts at column c, header row r
          // Find title row (look above)
          let title = '';
          for (let tr = 1; tr < r; tr++) {
            for (let tc = c - 1; tc <= c + 5; tc++) {
              if (tc < 1) continue;
              const tv = getCellStr(ws.getRow(tr).getCell(tc));
              if (tv && !tv.includes('الاسم') && !title.includes(tv) && isNaN(Number(tv))) {
                title += (title ? ' | ' : '') + tv;
              }
            }
          }

          // Read header columns
          const headers: { colIdx: number; header: string }[] = [];
          for (let hc = c; hc <= Math.min(ws.columnCount, c + 25); hc++) {
            const hVal = getCellStr(ws.getRow(r).getCell(hc));
            // Stop if we hit the next table's name column
            if (hc > c && (hVal.includes('الاسم') || hVal.includes('اللقب'))) break;
            if (hVal) headers.push({ colIdx: hc, header: hVal });
          }

          // Count paired student rows
          let studentCount = 0;
          let refundCount = 0;
          let bookPaymentCount = 0;
          let tuitionPaymentCount = 0;

          for (let sr = r + 1; sr <= ws.rowCount; sr += 2) {
            const row1 = ws.getRow(sr);
            const row2 = ws.getRow(sr + 1);
            const name1 = getCellStr(row1.getCell(c));
            const name2 = getCellStr(row2.getCell(c));
            const name = name1 || name2;

            if (!name || name.includes('الاسم') || name.includes('اللقب')) {
              // check if row sr+2 is also empty
              const peekName = getCellStr(ws.getRow(sr + 2).getCell(c));
              if (!peekName) break;
              continue;
            }

            studentCount++;

            // Check payments and vouchers across columns
            for (const h of headers) {
              const v1 = getCellStr(row1.getCell(h.colIdx));
              const v2 = getCellStr(row2.getCell(h.colIdx));
              if (v1 || v2) {
                if (v1.includes('RMB') || v2.includes('RMB') || v1.includes('remboursement') || v2.includes('remboursement')) {
                  refundCount++;
                }
                if (h.header.includes('مطبوعات') || h.header.includes('كتاب')) {
                  if (!isNaN(Number(v1)) && Number(v1) > 0) bookPaymentCount++;
                } else if (h.header.includes('الشهر')) {
                  if (!isNaN(Number(v1)) && Number(v1) > 0) tuitionPaymentCount++;
                }
              }
            }
          }

          console.log(`\nTable at Col ${c} (Header R${r}): Title: "${title}"`);
          console.log(`  Headers (${headers.length}): ${headers.map(h => `[C${h.colIdx}] ${h.header}`).join(' | ')}`);
          console.log(`  Students: ${studentCount}, Tuitions: ${tuitionPaymentCount}, Book payments: ${bookPaymentCount}, Refunds: ${refundCount}`);
          break; // move to next column search
        }
      }
    }
  }
}

async function main() {
  await analyzeOriginal();
}

main().catch(console.error);
