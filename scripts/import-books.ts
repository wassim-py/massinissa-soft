/**
 * scripts/import-books.ts
 * ═══════════════════════════════════════════════════════════════════
 * Imports book payments (Vouchers) and physical copy receipts (BookReceipt)
 * from the filled Excel template.
 *
 * USAGE:
 *   npx tsx scripts/import-books.ts --dry-run
 *   npx tsx scripts/import-books.ts
 *   npx tsx scripts/import-books.ts --file "data/books/BOOKS_ECOLE.xlsx"
 * ═══════════════════════════════════════════════════════════════════
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { Decimal } from 'decimal.js';
import { prisma } from './lib/db';

const BOOKS_DIR = path.join(__dirname, '../data/books');
const SYSTEM_USER = 'system_import';

const TRIMESTER_MAP: Record<string, number> = {
  T1: 24,
  'ت1': 24,
  '1': 24,
  T2: 25,
  'ت2': 25,
  '2': 25,
  T3: 26,
  'ت3': 26,
  '3': 26,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fileArg = (() => {
    const idx = process.argv.indexOf('--file');
    return idx >= 0 ? process.argv[idx + 1] : null;
  })();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  BOOKS PAYMENT & DISTRIBUTION IMPORTER  ${dryRun ? '[DRY RUN]' : '[EXECUTE]'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (!fs.existsSync(BOOKS_DIR)) {
    console.log(`Books directory not found: ${BOOKS_DIR}`);
    console.log('Generate template first: npx tsx scripts/generate-books-template.ts');
    return;
  }

  let files: string[];
  if (fileArg) {
    const resolved = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
    files = [resolved];
  } else {
    files = fs
      .readdirSync(BOOKS_DIR)
      .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
      .map((f) => path.join(BOOKS_DIR, f));
  }

  if (files.length === 0) {
    console.log('No files found in', BOOKS_DIR);
    return;
  }

  const classes = await prisma.class.findMany({
    include: { level: true, teacher: true },
  });
  const classMap = new Map(classes.map((c) => [c.id, c]));

  let totalVouchers = 0;
  let totalReceipts = 0;
  let totalBooksCreated = 0;

  for (const file of files) {
    console.log(`📄 Processing: ${path.basename(file)}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    if (!ws) continue;

    let rowIdx = 2;
    while (rowIdx <= ws.rowCount) {
      const row = ws.getRow(rowIdx);
      const studentName = getCellText(row.getCell(2));
      if (!studentName) {
        rowIdx++;
        continue;
      }

      // Metadata from note
      const noteText = ((row.getCell(2) as any).note as any)?.texts?.[0]?.text
        ?? (typeof (row.getCell(2) as any).note === 'string' ? (row.getCell(2) as any).note : '');
      const studentMatch = String(noteText).match(/student_id:([a-f0-9\-]{36})/i);
      const classMatch = String(noteText).match(/class_id:(\d+)/);

      if (!studentMatch || !classMatch) {
        rowIdx++;
        continue;
      }

      const studentId = studentMatch[1];
      const classId = parseInt(classMatch[1], 10);
      const cls = classMap.get(classId);
      if (!cls) {
        rowIdx++;
        continue;
      }

      const voucherNumRaw = row.getCell(4).value;
      const amountRaw = row.getCell(5).value;
      const dateRaw = row.getCell(6).value;
      const trimRaw = String(row.getCell(7).value || 'T1').toUpperCase().trim();
      const receivedRaw = row.getCell(8).value;

      const trimId = TRIMESTER_MAP[trimRaw] ?? 24;
      const hasVoucher = Boolean(voucherNumRaw && amountRaw);
      const hasReceived = receivedRaw === 1 || receivedRaw === '1' || String(receivedRaw).toUpperCase() === 'X';

      // ── 1. Create Book Voucher if filled ──────────────────────────
      if (hasVoucher) {
        const vNum = parseInt(String(voucherNumRaw).replace(/\D/g, ''), 10);
        const amt = parseFloat(String(amountRaw).replace(/[^\d.]/g, ''));
        const date = parseDateValue(dateRaw) ?? new Date();

        if (vNum && amt > 0) {
          if (!dryRun) {
            // Find series for this branch + level
            const series = await prisma.voucherSeries.findFirst({
              where: {
                issuingBranchId: cls.branchId,
                scope: 'LOCAL_LEVEL',
                levelId: cls.levelId ?? undefined,
              },
            });

            if (series) {
              const existingVoucher = await prisma.voucher.findFirst({
                where: {
                  studentId,
                  paymentType: 'BOOK',
                  number: vNum,
                  seriesId: series.id,
                },
              });

              if (!existingVoucher) {
                await prisma.voucher.create({
                  data: {
                    seriesId: series.id,
                    number: vNum,
                    studentId,
                    classId: cls.id,
                    issuingBranchId: cls.branchId,
                    targetBranchId: cls.branchId,
                    paymentType: 'BOOK',
                    amount: new Decimal(amt),
                    trimesterId: trimId,
                    issuedBy: SYSTEM_USER,
                    issuedAt: date,
                    status: 'ACTIVE',
                  },
                });
                totalVouchers++;

                if (!cls.hasBooks) {
                  await prisma.class.update({
                    where: { id: cls.id },
                    data: { hasBooks: true },
                  });
                  cls.hasBooks = true;
                }

                if (vNum > series.currentNumber) {
                  await prisma.voucherSeries.update({
                    where: { id: series.id },
                    data: { currentNumber: vNum },
                  });
                }
              }
            }
          } else {
            totalVouchers++;
          }
        }
      }

      // ── 2. Create Book Receipt if marked received ─────────────────
      if (hasReceived && cls.teacherId && cls.levelId) {
        if (!dryRun) {
          let book = await prisma.book.findFirst({
            where: {
              teacherId: cls.teacherId,
              levelId: cls.levelId,
              trimesterId: trimId,
            },
          });

          if (!book) {
            book = await prisma.book.create({
              data: {
                title: `كتاب ${trimRaw}`,
                teacherId: cls.teacherId,
                levelId: cls.levelId,
                trimesterId: trimId,
              },
            });
            totalBooksCreated++;
          }

          const existingReceipt = await prisma.bookReceipt.findFirst({
            where: { studentId, bookId: book.id },
          });

          if (!existingReceipt) {
            await prisma.bookReceipt.create({
              data: {
                studentId,
                bookId: book.id,
                receivedAt: parseDateValue(dateRaw) ?? new Date(),
                receivedBy: SYSTEM_USER,
              },
            });
            totalReceipts++;
          }
        } else {
          totalReceipts++;
        }
      }

      rowIdx++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(dryRun ? 'DRY RUN COMPLETE' : 'IMPORT COMPLETE');
  console.log(`  Book Vouchers (Payments):  ${totalVouchers}`);
  console.log(`  Book Receipts (Received):  ${totalReceipts}`);
  console.log(`  Books created:             ${totalBooksCreated}`);
  console.log(`${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
}

function parseDateValue(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const str = String(val).trim();
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dt = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function getCellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (!v) return null;
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text).trim();
  return String(v).trim();
}

main().catch(console.error);
