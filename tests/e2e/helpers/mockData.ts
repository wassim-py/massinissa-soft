/**
 * Mock Data Fixtures for Opaque-Box E2E Testing
 * Provides consistent, realistic datasets across all test tiers without mutating live data.
 */

export interface MockVoucher {
  id: number;
  number: number;
  seriesId?: number | null;
  series?: {
    id: number;
    prefix: string;
    branchId: number;
    branch?: { name: string };
    classLevel?: { name: string } | null;
  } | null;
  amount: number;
  type: string;
  issuedAt: Date;
  isVoided: boolean;
  isRefund: boolean;
  classId?: number | null;
  studentId?: string | null;
  issuingBranchId: number;
  metadata?: any;
}

export const MOCK_BRANCHES = [
  { id: 1, name: "ECOLE" },
  { id: 2, name: "AMPHI" },
  { id: 3, name: "ANNEX" },
];

export const MOCK_LEVELS = [
  { id: 70, name: "4AM" },
  { id: 71, name: "1AS" },
  { id: 72, name: "2AS" },
  { id: 73, name: "BAC" },
];

export const MOCK_VOUCHERS: MockVoucher[] = [
  // Voucher 1: Standard afternoon payment on Oct 21
  {
    id: 101,
    number: 101,
    series: {
      id: 1,
      prefix: "ECOLE 4AM",
      branchId: 1,
      branch: { name: "ECOLE" },
      classLevel: { name: "4AM" },
    },
    amount: 2500,
    type: "TUITION_4SESSION",
    issuedAt: new Date("2026-10-21T14:30:00+01:00"), // 13:30 UTC
    isVoided: false,
    isRefund: false,
    classId: 48,
    studentId: "std-001",
    issuingBranchId: 1,
  },
  // Voucher 2: CRITICAL MIDNIGHT PAYMENT: 00:30 AM local time on Oct 21 (UTC 2026-10-20T23:30:00Z)
  {
    id: 102,
    number: 102,
    series: {
      id: 2,
      prefix: "ANNEX 1AS",
      branchId: 3,
      branch: { name: "ANNEX" },
      classLevel: { name: "1AS" },
    },
    amount: 2000,
    type: "TUITION_4SESSION",
    issuedAt: new Date("2026-10-20T23:30:00.000Z"), // 00:30 AM Oct 21 Algiers
    isVoided: false,
    isRefund: false,
    classId: 46,
    studentId: "std-002",
    issuingBranchId: 3,
  },
  // Voucher 3: Evening payment at 23:59:00 on Oct 21 (UTC 22:59:00Z)
  {
    id: 103,
    number: 103,
    series: {
      id: 1,
      prefix: "ECOLE 4AM",
      branchId: 1,
      branch: { name: "ECOLE" },
      classLevel: { name: "4AM" },
    },
    amount: 1500,
    type: "TUITION_4SESSION",
    issuedAt: new Date("2026-10-21T22:59:00.000Z"), // 23:59 Algiers
    isVoided: false,
    isRefund: false,
    classId: 50,
    studentId: "std-003",
    issuingBranchId: 1,
  },
  // Voucher 4: Payment on next calendar day Oct 22 at 00:15 AM (UTC 2026-10-21T23:15:00Z)
  {
    id: 104,
    number: 104,
    series: {
      id: 3,
      prefix: "AMPHI BAC",
      branchId: 2,
      branch: { name: "AMPHI" },
      classLevel: { name: "BAC" },
    },
    amount: 3000,
    type: "TUITION_4SESSION",
    issuedAt: new Date("2026-10-21T23:15:00.000Z"), // 00:15 AM Oct 22 Algiers
    isVoided: false,
    isRefund: false,
    classId: 16,
    studentId: "std-004",
    issuingBranchId: 2,
  },
];
