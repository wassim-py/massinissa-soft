/**
 * scripts/audit_duplicates.ts
 * Read-only script to analyze and find duplicates or probable duplicates among students.
 */

import { prisma } from './lib/db';

function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // tashkeel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u0640]/g, '') // tatweel
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeGeneral(text: string): string {
  if (!text) return '';
  // strip diacritics / accents for Latin
  let norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  norm = normalizeArabic(norm);
  return norm.toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF\s]/gi, '').replace(/\s+/g, ' ');
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  // Algerian phone numbers typically start with 213, 00213, or 0
  if (digits.startsWith('00213')) {
    digits = '0' + digits.slice(5);
  } else if (digits.startsWith('213')) {
    digits = '0' + digits.slice(3);
  } else if (!digits.startsWith('0') && digits.length === 9) {
    digits = '0' + digits;
  }
  return digits;
}

function isDummyPhone(digits: string): boolean {
  if (digits.length < 9) return true;
  // check repetitive digits like 000000000 or 0555555555 or 123456789
  const uniqueDigits = new Set(digits.split(''));
  if (uniqueDigits.size <= 2) return true;
  if (digits === '0123456789' || digits === '0500000000') return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;
  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

interface StudentRecord {
  id: string;
  globalNumber: number;
  name: string;
  phone: string | null;
  birthday: Date | null;
  sex: string | null;
  payerStatus: string;
  registeredBranchId: number;
  registeredBranch: { name: string };
  createdAt: Date;
  vouchersCount: number;
  enrollmentsCount: number;
  attendancesCount: number;
  parentPhones: string[];
  classes: string[];
}

interface DuplicateMatch {
  studentA: StudentRecord;
  studentB: StudentRecord;
  confidence: 'CERTAIN' | 'HIGH' | 'PROBABLE' | 'SUSPECT';
  reasons: string[];
  details: string;
}

async function run() {
  console.log('Fetching students from database...');
  const studentsRaw = await prisma.student.findMany({
    select: {
      id: true,
      globalNumber: true,
      name: true,
      phone: true,
      birthday: true,
      sex: true,
      payerStatus: true,
      registeredBranchId: true,
      registeredBranch: { select: { name: true } },
      createdAt: true,
      _count: {
        select: {
          vouchers: true,
          enrollments: true,
          attendances: true,
        },
      },
      parentPhoneNumbers: {
        select: { phone: true },
      },
      enrollments: {
        include: {
          class: { select: { name: true } },
        },
      },
    },
    orderBy: { globalNumber: 'asc' },
  });

  console.log(`Loaded ${studentsRaw.length} total students.`);

  const students: StudentRecord[] = studentsRaw.map((s) => ({
    id: s.id,
    globalNumber: s.globalNumber,
    name: s.name,
    phone: s.phone,
    birthday: s.birthday,
    sex: s.sex,
    payerStatus: s.payerStatus,
    registeredBranchId: s.registeredBranchId,
    registeredBranch: s.registeredBranch,
    createdAt: s.createdAt,
    vouchersCount: s._count.vouchers,
    enrollmentsCount: s._count.enrollments,
    attendancesCount: s._count.attendances,
    parentPhones: s.parentPhoneNumbers.map((p) => p.phone).filter(Boolean),
    classes: s.enrollments.map((e) => e.class?.name).filter(Boolean) as string[],
  }));

  const matches: DuplicateMatch[] = [];
  const pairKey = (id1: string, id2: string) => (id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`);
  const seenPairs = new Set<string>();

  // Helper to add match
  function addMatch(
    a: StudentRecord,
    b: StudentRecord,
    confidence: DuplicateMatch['confidence'],
    reasons: string[],
    details: string
  ) {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (seenPairs.has(key)) {
      // Find existing match and augment reasons
      const existing = matches.find((m) => pairKey(m.studentA.id, m.studentB.id) === key);
      if (existing) {
        reasons.forEach((r) => {
          if (!existing.reasons.includes(r)) existing.reasons.push(r);
        });
        if (
          confidence === 'CERTAIN' ||
          (confidence === 'HIGH' && existing.confidence !== 'CERTAIN')
        ) {
          existing.confidence = confidence;
        }
      }
      return;
    }
    seenPairs.add(key);
    matches.push({
      studentA: a,
      studentB: b,
      confidence,
      reasons,
      details,
    });
  }

  // Pre-process student info
  const processed = students.map((s) => {
    const normName = normalizeGeneral(s.name);
    const words = normName.split(' ').filter(Boolean);
    const sortedWords = [...words].sort().join(' ');
    const cleanPhone = normalizePhone(s.phone);
    const cleanParentPhones = s.parentPhones.map(normalizePhone).filter((p) => !isDummyPhone(p));
    const allPhones = new Set<string>();
    if (cleanPhone && !isDummyPhone(cleanPhone)) allPhones.add(cleanPhone);
    cleanParentPhones.forEach((p) => allPhones.add(p));

    return {
      student: s,
      normName,
      words,
      sortedWords,
      cleanPhone: isDummyPhone(cleanPhone) ? '' : cleanPhone,
      allPhones: Array.from(allPhones),
    };
  });

  // 1. Exact phone number matches
  const phoneToStudents = new Map<string, typeof processed>();
  for (const item of processed) {
    for (const ph of item.allPhones) {
      if (!phoneToStudents.has(ph)) phoneToStudents.set(ph, []);
      phoneToStudents.get(ph)!.push(item);
    }
  }

  for (const [phone, list] of phoneToStudents.entries()) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          // Check name similarity when phone matches
          const nameDist = levenshtein(a.normName, b.normName);
          const sameWords = a.sortedWords === b.sortedWords;
          const shareAnyWord = a.words.some((w) => w.length > 2 && b.words.includes(w));

          if (a.normName === b.normName || sameWords) {
            addMatch(
              a.student,
              b.student,
              'CERTAIN',
              [`Identical Phone (${phone})`, `Identical/Permuted Name ("${a.student.name}" vs "${b.student.name}")`],
              `Matches on phone and full name.`
            );
          } else if (nameDist <= 3 || shareAnyWord) {
            addMatch(
              a.student,
              b.student,
              'HIGH',
              [`Identical Phone (${phone})`, `Similar Name ("${a.student.name}" vs "${b.student.name}")`],
              `Shared phone and similar name tokens.`
            );
          } else {
            // Might be siblings sharing parent phone, or duplicate with different nickname
            addMatch(
              a.student,
              b.student,
              'SUSPECT',
              [`Shared Phone (${phone})`, `Different Names ("${a.student.name}" vs "${b.student.name}")`],
              `Could be siblings or family members sharing a phone, or duplicate.`
            );
          }
        }
      }
    }
  }

  // 2. Name matches
  const exactNameMap = new Map<string, typeof processed>();
  const sortedWordsMap = new Map<string, typeof processed>();

  for (const item of processed) {
    if (item.normName.length > 2) {
      if (!exactNameMap.has(item.normName)) exactNameMap.set(item.normName, []);
      exactNameMap.get(item.normName)!.push(item);
    }
    if (item.sortedWords.length > 2) {
      if (!sortedWordsMap.has(item.sortedWords)) sortedWordsMap.set(item.sortedWords, []);
      sortedWordsMap.get(item.sortedWords)!.push(item);
    }
  }

  // Exact normalized name matches
  for (const [norm, list] of exactNameMap.entries()) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const sameBranch = a.student.registeredBranchId === b.student.registeredBranchId;
          const sameBirth =
            a.student.birthday &&
            b.student.birthday &&
            a.student.birthday.toISOString().slice(0, 10) === b.student.birthday.toISOString().slice(0, 10);

          let conf: DuplicateMatch['confidence'] = 'HIGH';
          const reasons = [`Exact Normalized Name ("${norm}")`];
          if (sameBranch) reasons.push(`Same Branch (${a.student.registeredBranch.name})`);
          if (sameBirth) {
            reasons.push(`Same Birthday (${a.student.birthday?.toISOString().slice(0, 10)})`);
            conf = 'CERTAIN';
          }
          addMatch(a.student, b.student, conf, reasons, `Names match normalized string.`);
        }
      }
    }
  }

  // Permuted word matches (e.g. "Ahmed Benali" vs "Benali Ahmed")
  for (const [sorted, list] of sortedWordsMap.entries()) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          addMatch(
            a.student,
            b.student,
            'HIGH',
            [`Inverted / Permuted Name Order ("${a.student.name}" vs "${b.student.name}")`],
            `Same words in different order.`
          );
        }
      }
    }
  }

  // 3. Fuzzy name comparisons (for students with same branch or high similarity)
  for (let i = 0; i < processed.length; i++) {
    for (let j = i + 1; j < processed.length; j++) {
      const a = processed[i];
      const b = processed[j];

      // Skip if already evaluated
      if (seenPairs.has(pairKey(a.student.id, b.student.id))) continue;

      // Only compare if minimum length
      if (a.normName.length < 5 || b.normName.length < 5) continue;

      // Check Levenshtein distance
      const lenDiff = Math.abs(a.normName.length - b.normName.length);
      if (lenDiff <= 3) {
        const dist = levenshtein(a.normName, b.normName);
        const maxLen = Math.max(a.normName.length, b.normName.length);
        const similarity = 1 - dist / maxLen;

        // If very close spelling (e.g. 1-2 typos)
        if (dist <= 2 && similarity >= 0.85) {
          const sameBranch = a.student.registeredBranchId === b.student.registeredBranchId;
          const conf = sameBranch ? 'PROBABLE' : 'SUSPECT';
          addMatch(
            a.student,
            b.student,
            conf,
            [
              `Typo / Fuzzy Name Similarity (${Math.round(similarity * 100)}% match, dist=${dist}): "${a.student.name}" vs "${b.student.name}"`,
              sameBranch ? `Same Branch (${a.student.registeredBranch.name})` : `Different Branches`,
            ],
            `Levenshtein distance of ${dist}.`
          );
        }
      }

      // Check if one name contains the other (e.g. "Mohamed amine benali" vs "amine benali")
      if (
        (a.normName.includes(b.normName) && b.normName.length >= 8) ||
        (b.normName.includes(a.normName) && a.normName.length >= 8)
      ) {
        const sameBranch = a.student.registeredBranchId === b.student.registeredBranchId;
        if (sameBranch) {
          addMatch(
            a.student,
            b.student,
            'PROBABLE',
            [
              `Sub-name Match ("${a.student.name}" / "${b.student.name}")`,
              `Same Branch (${a.student.registeredBranch.name})`,
            ],
            `One name is a substring of the other within the same branch.`
          );
        }
      }
    }
  }

  // Print results
  console.log(`\n======================================================`);
  console.log(`TOTAL POTENTIAL DUPLICATE PAIRS FOUND: ${matches.length}`);
  console.log(`======================================================\n`);

  const confidenceOrder = { CERTAIN: 1, HIGH: 2, PROBABLE: 3, SUSPECT: 4 };
  matches.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  const byConf = {
    CERTAIN: matches.filter((m) => m.confidence === 'CERTAIN'),
    HIGH: matches.filter((m) => m.confidence === 'HIGH'),
    PROBABLE: matches.filter((m) => m.confidence === 'PROBABLE'),
    SUSPECT: matches.filter((m) => m.confidence === 'SUSPECT'),
  };

  console.log(`- CERTAIN Duplicates (Identical Phone & Name / Birthday): ${byConf.CERTAIN.length}`);
  console.log(`- HIGH Probability (Identical Name or Phone + Similar Name): ${byConf.HIGH.length}`);
  console.log(`- PROBABLE Duplicates (Fuzzy Name + Same Branch): ${byConf.PROBABLE.length}`);
  console.log(`- SUSPECT / Siblings (Shared Phone but Different Name): ${byConf.SUSPECT.length}`);

  console.log('\n--- CERTAIN DUPLICATES ---');
  for (const m of byConf.CERTAIN) {
    printPair(m);
  }

  console.log('\n--- HIGH PROBABILITY DUPLICATES ---');
  for (const m of byConf.HIGH) {
    printPair(m);
  }

  console.log('\n--- PROBABLE DUPLICATES ---');
  for (const m of byConf.PROBABLE) {
    printPair(m);
  }

  console.log('\n--- SUSPECT / SHARED PHONE (Showing first 20) ---');
  for (const m of byConf.SUSPECT.slice(0, 20)) {
    printPair(m);
  }
}

function printPair(m: DuplicateMatch) {
  const { studentA: a, studentB: b } = m;
  console.log(`\n------------------------------------------------------------`);
  console.log(`[${m.confidence}] ${m.reasons.join(' | ')}`);
  console.log(
    `  A: #${a.globalNumber} "${a.name}" | Phone: ${a.phone ?? 'None'} | Branch: ${a.registeredBranch.name} | Vouchers: ${a.vouchersCount} | Enr: ${a.enrollmentsCount} | Att: ${a.attendancesCount} | Classes: [${a.classes.join(', ')}]`
  );
  console.log(
    `  B: #${b.globalNumber} "${b.name}" | Phone: ${b.phone ?? 'None'} | Branch: ${b.registeredBranch.name} | Vouchers: ${b.vouchersCount} | Enr: ${b.enrollmentsCount} | Att: ${b.attendancesCount} | Classes: [${b.classes.join(', ')}]`
  );
}

run()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
