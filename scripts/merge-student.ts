/**
 * scripts/merge-student.ts
 *
 * Command-line tool to merge duplicate students into a keeper student.
 * Supports:
 *   - Direct arguments: npx tsx scripts/merge-student.ts 136 651
 *   - Flags: npx tsx scripts/merge-student.ts --source 136 --target 651 --yes
 *   - Search: npx tsx scripts/merge-student.ts --search "ناردين"
 *   - Auto-scan: npx tsx scripts/merge-student.ts --scan
 *   - Interactive wizard (if run with no arguments)
 */

import * as readline from 'readline';
import { prisma } from './lib/db';
import { mergeStudents, MergeSummary } from '../src/lib/mergeStudents';

function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel (vowels/harakat)
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getStudentDetails(identifier: string | number) {
  const isNumber = !isNaN(Number(identifier));
  const where = isNumber
    ? { globalNumber: Number(identifier) }
    : { id: String(identifier) };

  return prisma.student.findUnique({
    where,
    include: {
      registeredBranch: { select: { name: true } },
      enrollments: {
        include: { class: { select: { name: true } } },
      },
      vouchers: { select: { id: true, amount: true, paymentType: true } },
      attendances: { select: { id: true } },
      parentPhoneNumbers: { select: { phone: true } },
    },
  });
}

async function searchStudents(term: string) {
  const isNum = !isNaN(Number(term));
  if (isNum) {
    const s = await prisma.student.findUnique({
      where: { globalNumber: Number(term) },
      include: {
        registeredBranch: { select: { name: true } },
        vouchers: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    });
    return s ? [s] : [];
  }

  const all = await prisma.student.findMany({
    select: {
      id: true,
      globalNumber: true,
      name: true,
      phone: true,
      registeredBranch: { select: { name: true } },
      vouchers: { select: { id: true } },
      enrollments: { select: { id: true } },
    },
    take: 1000,
  });

  const normTerm = normalizeArabic(term);
  return all.filter((s) => normalizeArabic(s.name).includes(normTerm)).slice(0, 10);
}

function printStudentCard(title: string, s: any) {
  console.log(`\n--- ${title} ---`);
  console.log(`  Global ID: #${s.globalNumber} (UUID: ${s.id})`);
  console.log(`  Full Name: ${s.name}`);
  console.log(`  Phone:     ${s.phone ?? 'None'}`);
  console.log(`  Branch:    ${s.registeredBranch?.name ?? 'Branch ' + s.registeredBranchId}`);
  console.log(`  Vouchers:  ${s.vouchers?.length ?? 0}`);
  console.log(
    `  Classes:   ${
      s.enrollments?.map((e: any) => e.class?.name ?? e.classId).join(', ') || 'None'
    }`
  );
  if (s.attendances) {
    console.log(`  Attendances: ${s.attendances.length}`);
  }
}

async function runScan() {
  console.log('\n🔍 Scanning database for potential duplicates...');
  const students = await prisma.student.findMany({
    select: {
      id: true,
      globalNumber: true,
      name: true,
      phone: true,
      registeredBranchId: true,
      vouchers: { select: { id: true } },
      enrollments: { select: { id: true } },
    },
  });

  // Group by phone
  const phoneMap = new Map<string, typeof students>();
  for (const s of students) {
    const cleanPhone = (s.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 8 && !['00000000', '0000000000'].includes(cleanPhone)) {
      if (!phoneMap.has(cleanPhone)) phoneMap.set(cleanPhone, []);
      phoneMap.get(cleanPhone)!.push(s);
    }
  }

  const pairs: Array<{ source: any; target: any; reason: string }> = [];

  for (const [phone, list] of phoneMap.entries()) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          pairs.push({
            source: a.vouchers.length <= b.vouchers.length ? a : b,
            target: a.vouchers.length <= b.vouchers.length ? b : a,
            reason: `Identical phone (${phone})`,
          });
        }
      }
    }
  }

  // Also check normalized name matches
  const nameMap = new Map<string, typeof students>();
  for (const s of students) {
    const norm = normalizeArabic(s.name);
    if (norm) {
      if (!nameMap.has(norm)) nameMap.set(norm, []);
      nameMap.get(norm)!.push(s);
    }
  }

  for (const [norm, list] of nameMap.entries()) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          // Check if not already added
          if (!pairs.some((p) => p.source.id === a.id && p.target.id === b.id)) {
            pairs.push({
              source: a.vouchers.length <= b.vouchers.length ? a : b,
              target: a.vouchers.length <= b.vouchers.length ? b : a,
              reason: `Normalized name match ("${norm}")`,
            });
          }
        }
      }
    }
  }

  console.log(`\nFound ${pairs.length} candidate duplicate pair(s).\n`);

  for (let idx = 0; idx < pairs.length; idx++) {
    const pair = pairs[idx];
    console.log(`\n========================================================`);
    console.log(`Candidate ${idx + 1} of ${pairs.length} — Reason: ${pair.reason}`);
    console.log(`Duplicate (To DELETE): #${pair.source.globalNumber} - ${pair.source.name} (Phone: ${pair.source.phone}, Vouchers: ${pair.source.vouchers.length}, Enr: ${pair.source.enrollments.length})`);
    console.log(`Keeper    (To KEEP):   #${pair.target.globalNumber} - ${pair.target.name} (Phone: ${pair.target.phone}, Vouchers: ${pair.target.vouchers.length}, Enr: ${pair.target.enrollments.length})`);

    const answer = await prompt(`Action: [m]erge / [s]wap keeper&source / [k]ip / [q]uit: `);
    const cmd = answer.toLowerCase().trim();

    if (cmd === 'q') {
      console.log('Exiting scan.');
      break;
    } else if (cmd === 'm') {
      try {
        console.log(`Merging #${pair.source.globalNumber} into #${pair.target.globalNumber}...`);
        const res = await mergeStudents({
          sourceId: pair.source.id,
          targetId: pair.target.id,
          performedBy: 'cli_scanner',
        });
        console.log(`✅ Success! Vouchers moved: ${res.summary.vouchersMoved}, Enrollments: ${res.summary.enrollmentsMoved} moved (${res.summary.enrollmentsDeduped} deduped).`);
      } catch (err: any) {
        console.error(`❌ Merge failed: ${err.message}`);
      }
    } else if (cmd === 's') {
      try {
        console.log(`Merging #${pair.target.globalNumber} into #${pair.source.globalNumber}...`);
        const res = await mergeStudents({
          sourceId: pair.target.id,
          targetId: pair.source.id,
          performedBy: 'cli_scanner',
        });
        console.log(`✅ Success! Vouchers moved: ${res.summary.vouchersMoved}, Enrollments: ${res.summary.enrollmentsMoved} moved (${res.summary.enrollmentsDeduped} deduped).`);
      } catch (err: any) {
        console.error(`❌ Merge failed: ${err.message}`);
      }
    } else {
      console.log('Skipped.');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--scan')) {
    await runScan();
    return;
  }

  let sourceArg: string | undefined;
  let targetArg: string | undefined;
  let autoConfirm = args.includes('--yes') || args.includes('-y');
  let searchArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) sourceArg = args[++i];
    else if (args[i] === '--target' && args[i + 1]) targetArg = args[++i];
    else if (args[i] === '--search' && args[i + 1]) searchArg = args[++i];
    else if (!args[i].startsWith('-')) {
      if (!sourceArg) sourceArg = args[i];
      else if (!targetArg) targetArg = args[i];
    }
  }

  if (searchArg) {
    console.log(`Searching for: "${searchArg}"...`);
    const results = await searchStudents(searchArg);
    if (results.length === 0) {
      console.log('No students found.');
    } else {
      console.table(
        results.map((r: any) => ({
          '#': r.globalNumber,
          Name: r.name,
          Phone: r.phone ?? 'None',
          Branch: r.registeredBranch?.name,
          Vouchers: r.vouchers?.length ?? 0,
          Enrollments: r.enrollments?.length ?? 0,
        }))
      );
    }
    return;
  }

  // Interactive mode if arguments are missing
  if (!sourceArg || !targetArg) {
    console.log('\n=============================================');
    console.log('      🎓 MASSINISSA STUDENT MERGE CLI        ');
    console.log('=============================================');

    if (!sourceArg) {
      const term = await prompt('Enter DUPLICATE student to delete (Global # or name): ');
      if (!term) {
        console.log('Aborted.');
        return;
      }
      const matches = await searchStudents(term);
      if (matches.length === 0) {
        console.log(`❌ No student found matching "${term}".`);
        return;
      } else if (matches.length === 1) {
        sourceArg = String(matches[0].globalNumber);
      } else {
        console.log('\nMultiple matches found:');
        matches.forEach((m: any, i: number) => {
          console.log(`  [${i + 1}] #${m.globalNumber} - ${m.name} (${m.registeredBranch?.name}, Vouchers: ${m.vouchers.length})`);
        });
        const pick = await prompt(`Pick duplicate (1-${matches.length}): `);
        const idx = parseInt(pick, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= matches.length) {
          console.log('Invalid selection.');
          return;
        }
        sourceArg = String(matches[idx].globalNumber);
      }
    }

    if (!targetArg) {
      const term = await prompt('Enter KEEPER student to keep (Global # or name): ');
      if (!term) {
        console.log('Aborted.');
        return;
      }
      const matches = await searchStudents(term);
      if (matches.length === 0) {
        console.log(`❌ No student found matching "${term}".`);
        return;
      } else if (matches.length === 1) {
        targetArg = String(matches[0].globalNumber);
      } else {
        console.log('\nMultiple matches found:');
        matches.forEach((m: any, i: number) => {
          console.log(`  [${i + 1}] #${m.globalNumber} - ${m.name} (${m.registeredBranch?.name}, Vouchers: ${m.vouchers.length})`);
        });
        const pick = await prompt(`Pick keeper (1-${matches.length}): `);
        const idx = parseInt(pick, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= matches.length) {
          console.log('Invalid selection.');
          return;
        }
        targetArg = String(matches[idx].globalNumber);
      }
    }
  }

  // Fetch full details
  const [sourceStudent, targetStudent] = await Promise.all([
    getStudentDetails(sourceArg),
    getStudentDetails(targetArg),
  ]);

  if (!sourceStudent) {
    console.error(`❌ Source student "${sourceArg}" not found in database.`);
    process.exit(1);
  }
  if (!targetStudent) {
    console.error(`❌ Target student "${targetArg}" not found in database.`);
    process.exit(1);
  }

  printStudentCard('DUPLICATE (Will be DELETED)', sourceStudent);
  printStudentCard('KEEPER (Will receive all records)', targetStudent);

  console.log('\n⚠️  PLAN SUMMARY:');
  console.log(`  - Move all ${sourceStudent.vouchers.length} vouchers from #${sourceStudent.globalNumber} to #${targetStudent.globalNumber}`);
  console.log(`  - Move/Deduplicate ${sourceStudent.enrollments.length} enrollments`);
  console.log(`  - Move/Deduplicate ${sourceStudent.attendances.length} attendance records`);
  console.log(`  - Permanently remove duplicate student #${sourceStudent.globalNumber} from the database`);

  if (!autoConfirm) {
    const confirm = await prompt('\nAre you sure you want to execute this merge? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Merge cancelled.');
      return;
    }
  }

  console.log('\nExecuting atomic merge transaction...');
  try {
    const result = await mergeStudents({
      sourceId: sourceStudent.id,
      targetId: targetStudent.id,
      performedBy: 'cli_manual',
    });

    console.log('\n=============================================');
    console.log('🎉 MERGE COMPLETED SUCCESSFULLY!');
    console.log('=============================================');
    console.log(`Keeper: #${result.target.globalNumber} - ${result.target.name}`);
    console.log(`Deleted: #${result.source.globalNumber} - ${result.source.name}`);
    console.log('Stats:');
    console.log(`  - Vouchers moved:           ${result.summary.vouchersMoved}`);
    console.log(`  - Enrollments moved:        ${result.summary.enrollmentsMoved} (Deduped: ${result.summary.enrollmentsDeduped})`);
    console.log(`  - Attendances moved:        ${result.summary.attendancesMoved} (Deduped: ${result.summary.attendancesDeduped})`);
    console.log(`  - Catch-ups moved:          ${result.summary.catchUpsMoved} (Deduped: ${result.summary.catchUpsDeduped})`);
    console.log(`  - Parent phones moved:      ${result.summary.parentPhonesMoved} (Deduped: ${result.summary.parentPhonesDeduped})`);
    console.log(`  - Audit Log ID:             ${result.auditLogId}`);
  } catch (error: any) {
    console.error(`\n❌ Error executing merge: ${error.message}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
