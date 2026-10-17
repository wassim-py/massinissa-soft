/**
 * src/lib/studentDeduplication.ts
 *
 * Advanced student anti-duplicate detection and name normalization utilities.
 * Handles:
 *  - Multilingual normalization (Arabic tashkeel, hamza, tatweel, Latin accents, cases)
 *  - Algerian compound prefixes (Ben, Ait, Bou, Ould, Bel, El, Ibn, Abd / بن، ايت، بو، ولد، بل، ابن، عبد)
 *  - Inverted names (First Name vs Family Name ordering)
 *  - Typo tolerance / string similarity (Levenshtein distance & token-set matching)
 *  - Phone number normalization & duplicate matching (student phone & parent phones)
 *  - Birthday comparison (distinguishing exact duplicates vs homonyms)
 */

export type DuplicateMatchType =
  | "EXACT_NAME"
  | "INVERTED_NAME"
  | "SIMILAR_NAME"
  | "PHONE_MATCH"
  | "PARENT_PHONE_MATCH"
  | "NAME_AND_BIRTHDAY";

export interface DuplicateStudentCandidate {
  id: string;
  globalNumber: number;
  name: string;
  phone: string | null;
  birthday: string | null;
  registeredBranchId: number;
  branchName: string;
  classes: string[];
  matchType: DuplicateMatchType;
  matchReasonFr: string;
  matchReasonAr: string;
  similarityScore: number; // 0 to 100
  isExactName: boolean;
  isSamePhone: boolean;
  isSameParentPhone: boolean;
  isSameBirthday: boolean;
  hasDifferentBirthday: boolean;
}

/**
 * Normalizes phone numbers:
 * - Strips all non-digit characters
 * - Strips Algerian country prefixes (+213, 00213, 213)
 * - Adds leading zero if 9 digits
 * Returns an empty string if invalid or a dummy sequence (e.g. 00000000).
 */
export function cleanPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Strip international prefixes
  if (digits.startsWith("00213")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("213") && digits.length >= 11) {
    digits = digits.slice(3);
  }

  // Prepend 0 if 9 digits starting with mobile/landline prefixes
  if (digits.length === 9 && ["5", "6", "7", "2", "3", "4"].includes(digits[0])) {
    digits = "0" + digits;
  }

  // Reject dummy placeholder numbers
  if (
    digits.length < 8 ||
    digits === "00000000" ||
    digits === "0000000000" ||
    digits === "12345678" ||
    digits === "0123456789"
  ) {
    return "";
  }

  return digits;
}

/**
 * Normalizes student names with high precision:
 * - Decomposes Latin accents (é, è, ê, ç, ô, etc.)
 * - Removes Arabic diacritics/tashkeel & Quranic signs
 * - Removes Arabic tatweel / kashida (ـ)
 * - Normalizes Arabic Alef forms (أ, إ, آ, ٱ -> ا)
 * - Normalizes Arabic Ta Marbuta (ة -> ه)
 * - Normalizes Arabic Alif Maqsura (ى -> ي)
 * - Normalizes Arabic Hamza forms (ئ -> ي, ؤ -> و, ء -> '')
 * - Removes non-alphanumeric punctuation (hyphens, quotes, slashes)
 * - Glues compound prefixes so "Ben Ali" and "Benali" normalize to "benali"
 */
export function normalizeStudentName(str?: string | null): string {
  if (!str) return "";
  let s = str.trim().toLowerCase();

  // 1. Unicode NFD decompose & remove Latin accents
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 2. Remove Arabic Tashkeel / Harakat (all diacritics) & Quranic annotations
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");

  // 3. Remove Arabic Tatweel / Kashida (ـ)
  s = s.replace(/\u0640/g, "");

  // 4. Normalize Arabic Alef variants (أ, إ, آ, ٱ) -> ا
  s = s.replace(/[أإآٱ]/g, "ا");

  // 5. Normalize Arabic Ta Marbuta (ة) -> ه
  s = s.replace(/ة/g, "ه");

  // 6. Normalize Arabic Alif Maqsura (ى) -> ي
  s = s.replace(/ى/g, "ي");

  // 7. Normalize Hamza forms
  s = s.replace(/ئ/g, "ي");
  s = s.replace(/ؤ/g, "و");
  s = s.replace(/ء/g, "");

  // 8. Replace punctuation and symbols with spaces
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 9. Glue compound prefixes
  // Latin: ben, ait, bou, ould, bel, el, ibn, abd
  s = s.replace(/\b(ben|ait|bou|ould|bel|ibn|abd)\s+/gi, "$1");
  // Arabic: بن, ايت, بو, ولد, بل, ابن, عبد
  s = s.replace(/(^|\s)(بن|ايت|بو|ولد|بل|ابن|عبد)\s+/gu, "$1$2");

  // 10. Collapse multiple spaces & trim
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Splits normalized name into distinctive tokens (length >= 2).
 */
export function tokenizeStudentName(str?: string | null): string[] {
  const norm = normalizeStudentName(str);
  if (!norm) return [];
  return norm.split(" ").filter((t) => t.length >= 2);
}

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Returns string similarity ratio between 0.0 and 1.0 based on Levenshtein distance.
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Compares two token arrays and returns the token overlap ratio (0.0 to 1.0).
 */
export function tokenSetSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let matches = 0;
  for (const t of tokensA) {
    if (setB.has(t)) {
      matches++;
    } else {
      // Check for 1-char typo match against any token in B
      const hasCloseMatch = tokensB.some(
        (tb) => Math.abs(tb.length - t.length) <= 1 && stringSimilarity(t, tb) >= 0.8
      );
      if (hasCloseMatch) matches += 0.85;
    }
  }
  return Math.min(1, matches / Math.max(tokensA.length, tokensB.length));
}

/**
 * Evaluates candidate student record against user input fields and returns a match candidate if scored >= threshold.
 */
export function evaluateDuplicateMatch({
  targetName,
  targetSurname,
  targetPhone,
  targetParentPhones = [],
  targetBirthday,
  candidate,
}: {
  targetName: string;
  targetSurname: string;
  targetPhone?: string | null;
  targetParentPhones?: string[];
  targetBirthday?: string | null;
  candidate: {
    id: string;
    globalNumber: number;
    name: string;
    phone: string | null;
    birthday: Date | string | null;
    registeredBranchId: number;
    registeredBranch?: { name?: string } | null;
    enrollments?: Array<{ class: { id: number; name: string } }>;
    parentPhoneNumbers?: Array<{ phone: string }>;
  };
}): DuplicateStudentCandidate | null {
  const cleanTargetFirst = normalizeStudentName(targetName);
  const cleanTargetLast = normalizeStudentName(targetSurname);
  const candNorm = normalizeStudentName(candidate.name);

  const targetTokens = [
    ...tokenizeStudentName(targetSurname),
    ...tokenizeStudentName(targetName),
  ];
  const candTokens = tokenizeStudentName(candidate.name);

  const fullComboNormal = [cleanTargetLast, cleanTargetFirst].filter(Boolean).join(" ");
  const fullComboInverted = [cleanTargetFirst, cleanTargetLast].filter(Boolean).join(" ");

  // 1. Name Match Checks
  const isExactOrderNormal = candNorm === fullComboNormal && fullComboNormal.length > 0;
  const isExactOrderInverted = candNorm === fullComboInverted && fullComboInverted.length > 0;
  const isExactName = isExactOrderNormal || isExactOrderInverted;

  // Token exact match (set equality)
  const sortedTargetTokens = [...targetTokens].sort().join(" ");
  const sortedCandTokens = [...candTokens].sort().join(" ");
  const isInvertedName =
    !isExactName &&
    sortedTargetTokens.length > 0 &&
    sortedTargetTokens === sortedCandTokens;

  // Token containment (e.g. "Benali Mohamed" contained in "Benali Mohamed Amine")
  const allTargetTokensInCand =
    targetTokens.length >= 2 &&
    targetTokens.every((t) => candTokens.includes(t));

  // Edit distance similarity
  const simNormal = stringSimilarity(candNorm, fullComboNormal);
  const simInverted = stringSimilarity(candNorm, fullComboInverted);
  const nameSimilarity = Math.max(simNormal, simInverted);
  const tokenSim = tokenSetSimilarity(targetTokens, candTokens);
  const bestNameScore = Math.max(nameSimilarity, tokenSim);

  // 2. Phone Match Checks
  const cleanInputPhone = cleanPhoneNumber(targetPhone);
  const cleanCandPhone = cleanPhoneNumber(candidate.phone);
  const isSamePhone =
    cleanInputPhone.length >= 8 &&
    cleanCandPhone.length >= 8 &&
    (cleanInputPhone === cleanCandPhone ||
      cleanInputPhone.slice(-8) === cleanCandPhone.slice(-8));

  // Parent Phones
  const cleanInputParentPhones = targetParentPhones
    .map(cleanPhoneNumber)
    .filter((p) => p.length >= 8);
  const cleanCandParentPhones = (candidate.parentPhoneNumbers || [])
    .map((p) => cleanPhoneNumber(p.phone))
    .filter((p) => p.length >= 8);

  let isSameParentPhone = false;
  if (cleanInputParentPhones.length > 0) {
    for (const inP of cleanInputParentPhones) {
      if (
        (cleanCandPhone.length >= 8 && inP.slice(-8) === cleanCandPhone.slice(-8)) ||
        cleanCandParentPhones.some((cp) => cp.slice(-8) === inP.slice(-8))
      ) {
        isSameParentPhone = true;
        break;
      }
    }
  }
  // Also check if user student phone matches candidate's parent phone
  if (!isSamePhone && cleanInputPhone.length >= 8) {
    if (cleanCandParentPhones.some((cp) => cp.slice(-8) === cleanInputPhone.slice(-8))) {
      isSameParentPhone = true;
    }
  }

  // 3. Birthday Match Checks
  const inputBirthdayStr = targetBirthday
    ? new Date(targetBirthday).toISOString().split("T")[0]
    : null;
  const candBirthdayStr = candidate.birthday
    ? new Date(candidate.birthday).toISOString().split("T")[0]
    : null;

  const hasBirthdayComparison = Boolean(inputBirthdayStr && candBirthdayStr);
  const isSameBirthday = hasBirthdayComparison && inputBirthdayStr === candBirthdayStr;
  const hasDifferentBirthday = hasBirthdayComparison && inputBirthdayStr !== candBirthdayStr;

  // 4. Determine Match Type, Similarity Score & Reason
  let matchType: DuplicateMatchType | null = null;
  let similarityScore = 0;
  let matchReasonFr = "";
  let matchReasonAr = "";

  if (isExactName && isSameBirthday) {
    matchType = "NAME_AND_BIRTHDAY";
    similarityScore = 100;
    matchReasonFr = "Nom, prénom et date de naissance identiques";
    matchReasonAr = "تطابق تام في الاسم واللقب وتاريخ الميلاد";
  } else if (isExactName) {
    matchType = "EXACT_NAME";
    similarityScore = 98;
    matchReasonFr = "Nom et prénom strictement identiques";
    matchReasonAr = "تطابق تام في الاسم واللقب";
  } else if (isInvertedName) {
    matchType = "INVERTED_NAME";
    similarityScore = 96;
    matchReasonFr = "Nom et prénom inversés identiques";
    matchReasonAr = "تطابق مع عكس الاسم واللقب";
  } else if (allTargetTokensInCand) {
    matchType = "SIMILAR_NAME";
    similarityScore = 92;
    matchReasonFr = "Nom et prénom inclus dans cette fiche";
    matchReasonAr = "الاسم واللقب متضمنان في هذه البطاقة";
  } else if (isSamePhone && bestNameScore >= 0.6) {
    matchType = "PHONE_MATCH";
    similarityScore = 94;
    matchReasonFr = "Même numéro de téléphone et nom très similaire";
    matchReasonAr = "نفس رقم الهاتف مع تشابه كبير في الاسم";
  } else if (isSamePhone) {
    matchType = "PHONE_MATCH";
    similarityScore = 88;
    matchReasonFr = "Même numéro de téléphone personnel";
    matchReasonAr = "نفس رقم الهاتف الشخصي";
  } else if (isSameParentPhone && bestNameScore >= 0.6) {
    matchType = "PARENT_PHONE_MATCH";
    similarityScore = 90;
    matchReasonFr = "Même numéro de parent et nom similaire";
    matchReasonAr = "نفس رقم ولي الأمر مع تشابه في الاسم";
  } else if (isSameParentPhone) {
    matchType = "PARENT_PHONE_MATCH";
    similarityScore = 80;
    matchReasonFr = "Même numéro de téléphone de contact (famille / fratrie)";
    matchReasonAr = "نفس رقم هاتف ولي الأمر (احتمال أخ أو نفس العائلة)";
  } else if (bestNameScore >= 0.82) {
    matchType = "SIMILAR_NAME";
    similarityScore = Math.round(bestNameScore * 100);
    matchReasonFr = `Orthographe très proche (${similarityScore}% de similarité)`;
    matchReasonAr = `تشابه كبير في الحروف (${similarityScore}% تطابق)`;
  }

  if (!matchType) {
    return null;
  }

  const classes = (candidate.enrollments || []).map((e) => e.class.name).filter(Boolean);

  return {
    id: candidate.id,
    globalNumber: candidate.globalNumber,
    name: candidate.name,
    phone: candidate.phone,
    birthday: candBirthdayStr,
    registeredBranchId: candidate.registeredBranchId,
    branchName: candidate.registeredBranch?.name || "Siège",
    classes,
    matchType,
    matchReasonFr,
    matchReasonAr,
    similarityScore,
    isExactName,
    isSamePhone,
    isSameParentPhone,
    isSameBirthday,
    hasDifferentBirthday,
  };
}
