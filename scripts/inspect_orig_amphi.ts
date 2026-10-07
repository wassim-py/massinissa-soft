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

async function inspectOrigAmphi() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/2027 AMPHI.xlsx');

  for (const s of wb.worksheets) {
    console.log(`\n========================================================================`);
    console.log(`SHEET: "${s.name}" (rows: ${s.rowCount}, cols: ${s.columnCount})`);
    console.log(`========================================================================`);

    // Find table headers with "الاسم"
    const tables: Array<{ r: number; c: number; title: string; colHeaders: string[]; studentCount: number; sampleStudents: string[] }> = [];

    for (let r = 1; r <= 15; r++) {
      const row = s.getRow(r);
      for (let c = 1; c <= s.columnCount; c++) {
        const val = getCellStr(row.getCell(c));
        if (val.includes('الاسم') || val.includes('اللقب') || val.includes('إسم') || val.includes('اسم')) {
          // Find title
          let title = '';
          for (let tr = r - 1; tr >= Math.max(1, r - 5); tr--) {
            for (let tc = Math.max(1, c - 2); tc <= c + 10; tc++) {
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
            const hv = getCellStr(row.getCell(hc));
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
        }
      }
    }

    console.log(`Tables found in "${s.name}": ${tables.length}`);
    for (const t of tables) {
      console.log(`  [R${t.r} C${t.c}] "${t.title}" -> ${t.studentCount} students (samples: ${t.sampleStudents.join(', ')})`);
      console.log(`      Headers: ${t.colHeaders.slice(0, 8).join(' | ')}`);
    }
  }
}

inspectOrigAmphi().catch(console.error);
