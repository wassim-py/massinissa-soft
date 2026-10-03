/**
 * scripts/fix-excel-dates.ts
 * Normalizes all date headers in Row 4 of attendance Excel files
 * so they are formatted as pure DD/MM/YYYY text strings.
 */
import * as path from 'path';
import * as fs from 'fs';
const ExcelJS = require('exceljs');

const ATTENDANCE_DIR = path.join(__dirname, '../data/attendance');
const BACKUP_DIR = path.join(__dirname, '../data/attendance_backup');

function normalizeDate(rawVal: any, cellText: string): string | null {
  if (rawVal === null || rawVal === undefined) return null;

  const str = String(cellText || rawVal).trim();
  if (str.includes('كتاب') || str.includes('ت 1') || str.includes('ت 2') || str.includes('ت 3')) {
    return null;
  }
  if (!str) return null;

  if (str === '18') return '18/09/2026';
  if (str === '25') return '25/09/2026';

  if (str.includes('206') && !str.includes('2026')) {
    const fixed = str.replace('206', '2026');
    const m = fixed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    }
  }

  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const origMonth = rawVal.getMonth(); // 0 to 11
    const origDay = rawVal.getDate();    // 1 to 31
    const year = rawVal.getFullYear();

    const trueDay = origMonth + 1;
    const trueMonth = origDay;

    return `${String(trueDay).padStart(2, '0')}/${String(trueMonth).padStart(2, '0')}/${year}`;
  }

  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }

  return str;
}

async function fixAllExcelFiles() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const files = fs.readdirSync(ATTENDANCE_DIR).filter((f: string) => f.endsWith('.xlsx') && !f.startsWith('~$'));
  console.log(`Processing ${files.length} Excel files...`);

  let modifiedFilesCount = 0;
  let modifiedDatesCount = 0;

  for (const f of files) {
    const filePath = path.join(ATTENDANCE_DIR, f);
    const backupPath = path.join(BACKUP_DIR, f);

    // Create backup first
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(filePath);
    } catch (e: any) {
      console.error(`Cannot read ${f}:`, e.message);
      continue;
    }

    const ws = wb.worksheets.find((s: any) => !s.name.includes('Instruction') && !s.name.includes('📖'));
    if (!ws) continue;

    const dateRow = ws.getRow(4);
    let fileChanged = false;

    dateRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
      if (colNumber < 3) return;
      const v = cell.value;
      const txt = cell.text;
      const normalized = normalizeDate(v, txt);
      if (normalized) {
        if (cell.value !== normalized) {
          cell.value = normalized;
          cell.numFmt = '@'; // Force text format
          fileChanged = true;
          modifiedDatesCount++;
        }
      }
    });

    if (fileChanged) {
      await wb.xlsx.writeFile(filePath);
      modifiedFilesCount++;
    }
  }

  console.log(`\nDone! Backup created at ${BACKUP_DIR}`);
  console.log(`Modified ${modifiedDatesCount} dates across ${modifiedFilesCount} files.`);
}

fixAllExcelFiles().catch(console.error);
