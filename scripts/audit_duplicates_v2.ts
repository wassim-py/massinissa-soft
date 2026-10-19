/**
 * scripts/audit_duplicates_v2.ts
 * Detailed and smart duplication detector distinguishing duplicates from siblings.
 */

import { prisma } from './lib/db';
import * as fs from 'fs';
import * as path from 'path';

function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // tashkeel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u0640]/g, '') // tatweel
    .replace(/[\u0621\u0624\u0626]/g, 'ء') // normalize hamza forms
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeGeneral(text: string): string {
  if (!text) return '';
  let norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  norm = normalizeArabic(norm);
  return norm.toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF\s]/gi, '').replace(/\s+/g, ' ');
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
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
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

// Split Arabic name into tokens, ignoring common prefixes like "بن", "بو", "ايت", "ال", "عبد"
function getSignificantTokens(normName: string): string[] {
  const words = normName.split(' ').filter(Boolean);
  return words;
}

function areNamesNearIdentical(nameA: string, nameB: string): { isNear: boolean; dist: number; type: string } {
  const a = normalizeGeneral(nameA);
  const b = normalizeGeneral(nameB);
  if (a === b) return { isNear: true, dist: 0, type: 'EXACT' };

  // Check word permutation (e.g. "فهد ايت كالي" vs "ايت كالي فهد")
  const wordsA = a.split(' ').sort().join(' ');
  const wordsB = b.split(' ').sort().join(' ');
  if (wordsA === wordsB) return { isNear: true, dist: 0, type: 'PERMUTED_WORDS' };

  // Check Levenshtein distance on full string
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (dist <= 2 && dist / maxLen <= 0.25) {
    return { isNear: true, dist, type: `TYPO_${dist}` };
  }

  // Check if one contains the other (e.g. "عيون سهى ملاك" vs "عيون سهى")
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length);
    if (minLen >= 6) {
      return { isNear: true, dist: Math.abs(a.length - b.length), type: 'SUBSTRING_NAME' };
    }
  }

  return { isNear: false, dist, type: 'DIFFERENT' };
}

interface StudentInfo {
  id: string;
  globalNumber: number;
  name: string;
  phone: string | null;
  birthday: Date | null;
  branchName: string;
  branchId: number;
  vouchersCount: number;
  enrollmentsCount: number;
  attendancesCount: number;
  classes: string[];
  allPhones: string[];
  cleanName: string;
}

async function main() {
  const studentsRaw = await prisma.student.findMany({
    select: {
      id: true,
      globalNumber: true,
      name: true,
      phone: true,
      birthday: true,
      registeredBranchId: true,
      registeredBranch: { select: { name: true } },
      _count: {
        select: { vouchers: true, enrollments: true, attendances: true },
      },
      parentPhoneNumbers: { select: { phone: true } },
      enrollments: {
        include: { class: { select: { name: true } } },
      },
    },
    orderBy: { globalNumber: 'asc' },
  });

  const students: StudentInfo[] = studentsRaw.map((s) => {
    const phones = new Set<string>();
    const cleanP = normalizePhone(s.phone);
    if (cleanP && !isDummyPhone(cleanP)) phones.add(cleanP);
    s.parentPhoneNumbers.forEach((pp) => {
      const p = normalizePhone(pp.phone);
      if (p && !isDummyPhone(p)) phones.add(p);
    });

    return {
      id: s.id,
      globalNumber: s.globalNumber,
      name: s.name,
      phone: s.phone,
      birthday: s.birthday,
      branchName: s.registeredBranch.name,
      branchId: s.registeredBranchId,
      vouchersCount: s._count.vouchers,
      enrollmentsCount: s._count.enrollments,
      attendancesCount: s._count.attendances,
      classes: s.enrollments.map((e) => e.class?.name).filter(Boolean) as string[],
      allPhones: Array.from(phones),
      cleanName: normalizeGeneral(s.name),
    };
  });

  const duplicatesCertain: Array<{ a: StudentInfo; b: StudentInfo; reason: string }> = [];
  const duplicatesProbable: Array<{ a: StudentInfo; b: StudentInfo; reason: string }> = [];
  const exactNameDifferentPhone: Array<{ a: StudentInfo; b: StudentInfo; reason: string }> = [];
  const likelySiblings: Array<{ a: StudentInfo; b: StudentInfo; reason: string; phone: string }> = [];

  const pairKey = (id1: string, id2: string) => (id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`);
  const seenPairs = new Set<string>();

  // Compare all pairs
  for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) {
      const a = students[i];
      const b = students[j];
      const key = pairKey(a.id, b.id);
      if (seenPairs.has(key)) continue;

      const sharedPhone = a.allPhones.find((p) => b.allPhones.includes(p));
      const nameCheck = areNamesNearIdentical(a.name, b.name);
      const isValidDate = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());
      const sameBirth =
        isValidDate(a.birthday) &&
        isValidDate(b.birthday) &&
        a.birthday.toISOString().slice(0, 10) === b.birthday.toISOString().slice(0, 10);
      const sameBranch = a.branchId === b.branchId;

      if (sharedPhone) {
        if (nameCheck.type === 'EXACT' || nameCheck.type === 'PERMUTED_WORDS') {
          seenPairs.add(key);
          duplicatesCertain.push({
            a,
            b,
            reason: `Identical phone (${sharedPhone}) & Same Name ("${a.name}" / "${b.name}")`,
          });
        } else if (nameCheck.isNear) {
          seenPairs.add(key);
          duplicatesCertain.push({
            a,
            b,
            reason: `Identical phone (${sharedPhone}) & Typo/Variant in Name ("${a.name}" vs "${b.name}") [${nameCheck.type}]`,
          });
        } else {
          // Shared phone but different names: Check if they share a family name (siblings)
          const wordsA = a.cleanName.split(' ');
          const wordsB = b.cleanName.split(' ');
          const sharedWord = wordsA.find((w) => w.length >= 3 && wordsB.includes(w));
          seenPairs.add(key);
          if (sharedWord) {
            likelySiblings.push({
              a,
              b,
              reason: `Shared family name ("${sharedWord}") & shared phone (${sharedPhone})`,
              phone: sharedPhone,
            });
          } else {
            likelySiblings.push({
              a,
              b,
              reason: `Shared phone (${sharedPhone}) but distinct names`,
              phone: sharedPhone,
            });
          }
        }
      } else {
        // No shared phone
        if (nameCheck.type === 'EXACT' || nameCheck.type === 'PERMUTED_WORDS') {
          seenPairs.add(key);
          if (sameBirth || sameBranch) {
            duplicatesProbable.push({
              a,
              b,
              reason: `Identical Name ("${a.name}") & ${sameBirth ? 'Same Birthday' : ''} ${sameBranch ? `Same Branch (${a.branchName})` : ''}`,
            });
          } else {
            exactNameDifferentPhone.push({
              a,
              b,
              reason: `Identical Name across different branches (${a.branchName} vs ${b.branchName}), different phones`,
            });
          }
        } else if (nameCheck.isNear && (sameBirth || (sameBranch && nameCheck.dist <= 1))) {
          seenPairs.add(key);
          duplicatesProbable.push({
            a,
            b,
            reason: `Near-identical Name ("${a.name}" vs "${b.name}") in ${a.branchName} [${nameCheck.type}]`,
          });
        }
      }
    }
  }

  const out = {
    totalStudents: students.length,
    certainDuplicatesCount: duplicatesCertain.length,
    probableDuplicatesCount: duplicatesProbable.length,
    exactNameDifferentBranchCount: exactNameDifferentPhone.length,
    likelySiblingsCount: likelySiblings.length,
    duplicatesCertain,
    duplicatesProbable,
    exactNameDifferentPhone,
    likelySiblings,
  };

  fs.writeFileSync(
    path.join(__dirname, 'duplicate_audit_result.json'),
    JSON.stringify(out, null, 2),
    'utf-8'
  );

  console.log('AUDIT COMPLETED:');
  console.log(`- Total Students: ${out.totalStudents}`);
  console.log(`- CERTAIN DUPLICATES (Same Phone + Same Name / Typo / Name Permutation): ${out.certainDuplicatesCount}`);
  console.log(`- PROBABLE DUPLICATES (Identical Name in same branch / Same Birthday): ${out.probableDuplicatesCount}`);
  console.log(`- HOMONYMS / CROSS-BRANCH (Identical Name, different branches & phones): ${out.exactNameDifferentBranchCount}`);
  console.log(`- LIKELY SIBLINGS (Shared Parent Phone, Different First Names): ${out.likelySiblingsCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
