# TEST_READY: Comprehensive Opaque-Box E2E Test Suite (Tiers 1–5)

**Project**: Cross-Device Timezone, Voucher, Ledger & Cache Synchronization  
**Integrity Mode**: Development / Demo  
**Date**: 2026-10-21  
**Status**: TEST SUITE COMPLETE & EXECUTABLE  

---

## 1. Master Runner Command

The test suite is executable out-of-the-box using the project's native `tsx` engine without requiring any additional external dependencies:

```powershell
npx tsx tests/e2e/run-all.ts
```

### Individual Tier Execution Commands
| Tier | Description | Command |
|---|---|---|
| **Tier 1** | Feature Coverage (F1–F12, >=5 tests/feature) | `npx tsx tests/e2e/tier1-features/run-tier1.ts` |
| **Tier 2** | Boundary & Corner Cases (60 boundary cases) | `npx tsx tests/e2e/tier2-boundaries/boundary-corner-cases.test.ts` |
| **Tier 3** | Cross-Feature Combinations (Pairwise interactions) | `npx tsx tests/e2e/tier3-combinations/cross-feature-combinations.test.ts` |
| **Tier 4** | Real-World Application Scenarios (Cashier workflows) | `npx tsx tests/e2e/tier4-scenarios/real-world-workflows.test.ts` |
| **Tier 5** | Adversarial Hardening & Stress Verification | `npx tsx tests/e2e/tier5-adversarial/adversarial-stress.test.ts` |

---

## 2. Test Architecture & Coverage Matrix

| Req | Feature ID | Feature Description | Tier 1 Tests | Tier 2 Boundaries | Tier 3 Pairwise | Tier 4 Scenarios | Tier 5 Stress | Total Tests |
|---|---|---|---|---|---|---|---|---|
| **R1** | **F1** | Centralized Algiers Date/Time Engine | F1-01 to F1-06 (6) | B01 to B05 (5) | XF-02, XF-03, XF-06 | Scenario 1, 4, 5 | ADV-03, ADV-04, ADV-05 | **20** |
| **R4** | **F2** | Deterministic Currency & SSR Locale Formatting | F2-01 to F2-05 (5) | B06 to B10 (5) | XF-04 | Scenario 2, 5 | ADV-02 | **14** |
| **R2** | **F3** | Eliminate `"01/01/2026"` Hardcoded Fallbacks | F3-01 to F3-06 (6) | B11 to B15 (5) | XF-07 | Scenario 1 | ADV-01 | **14** |
| **R2** | **F4** | Consistent Voucher Labels Across Screens | F4-01 to F4-05 (5) | B16 to B20 (5) | XF-01, XF-09, XF-10 | Scenario 1 | ADV-01, ADV-06 | **15** |
| **R2** | **F5** | Standardize Thermal & Printable Tickets | F5-01 to F5-05 (5) | B21 to B25 (5) | XF-02, XF-07, XF-09 | Scenario 1, 4 | ADV-01 | **15** |
| **R3** | **F6** | Ledger 00:00–01:00 AM Boundary Normalization | F6-01 to F6-05 (5) | B26 to B30 (5) | XF-01, XF-04, XF-05, XF-08, XF-10 | Scenario 1, 3 | ADV-03 | **18** |
| **R3** | **F7** | Revenue Query Business-Day Window Alignment | F7-01 to F7-05 (5) | B31 to B35 (5) | XF-03 | Scenario 1 | ADV-05 | **13** |
| **R3** | **F8** | Algiers-Anchored "Today" Filter & Date Pickers | F8-01 to F8-05 (5) | B36 to B40 (5) | XF-03 | Scenario 1, 6 | ADV-05 | **13** |
| **R5** | **F9** | Unified Financial Cache Revalidation Helper | F9-01 to F9-05 (5) | B41 to B45 (5) | XF-01, XF-05, XF-08 | Scenario 1, 3 | - | **13** |
| **R5** | **F10** | Mutating Server Actions Revalidation | F10-01 to F10-05 (5) | B46 to B50 (5) | XF-01, XF-04, XF-05, XF-08, XF-09, XF-10 | Scenario 1, 2, 3, 4 | - | **18** |
| **R1** | **F11** | Cross-Device Schedule & Attendance Timezone | F11-01 to F11-05 (5) | B51 to B55 (5) | XF-06 | Scenario 5 | ADV-05 | **13** |
| **All** | **F12** | Comprehensive E2E Verification & Hardening | F12-01 to F12-05 (5) | B56 to B60 (5) | - | - | ADV-01 to ADV-06 (6) | **16** |
| **Total** | | | **62 Tests** | **60 Tests** | **10 Tests** | **6 Tests** | **6 Tests** | **144 Tests** |

---

## 3. Baseline Test Run Results (Pre-Implementation State)

A baseline run of `npx tsx tests/e2e/run-all.ts` against the current codebase yielded:
- **Total Tests Executed**: 142
- **Passed**: 51
- **Failed**: 91

### Breakdown of Baseline Failures (Known Implementation Defects to Resolve in Milestones):
1. **Milestone 1 (F1, F2 - Pending implementation)**:
   - Module `src/lib/algiersDate.ts` does not yet exist.
   - `formatDZD` currency formatter not implemented.
   - `src/i18n/request.ts` and `layout.tsx` missing `timeZone: "Africa/Algiers"`.
2. **Milestone 2 (F3, F4, F5 - Known defects in current code)**:
   - `src/lib/voucherUtils.ts` contains 4 occurrences of `"01/01/2026"` (lines 64, 66, 113, 227).
   - `RevenuePaymentsTable.tsx` renders bare `#{v.number}` without series and level context.
   - `src/lib/revenue.ts` voucher queries do not select `series` or `class.level`.
   - `PrintWorkshopTicketButton.tsx` lacks `@page { size: 80mm auto; margin: 0; }` and `<base href>`.
   - `WorkshopTicket.tsx` and `PayslipTicket.tsx` use device host timezones without `Africa/Algiers`.
3. **Milestone 3 (F6, F7, F8 - Known defects in current code)**:
   - `normalizeDateToStartOfDay` in `src/lib/ledger.ts` and `sync-database-payments.js` shifts 00:00–01:00 AM transactions to previous day due to UTC midnight assumptions.
   - `src/lib/revenue.ts` query bounds use UTC midnight instead of Algerian business day bounds ($D-1\text{ 23:00Z}$ to $D\text{ 22:59:59.999Z}$).
   - `RevenueFilterBar.tsx` and `daily-ledger/page.tsx` use `new Date().toISOString().split("T")[0]`.
   - `daily-ledger/page.tsx` blocks branch admins from inspecting past/future dates.
4. **Milestone 4 (F9, F10 - Pending implementation & action integration)**:
   - Module `src/lib/revalidation.ts` does not yet exist.
   - Mutating server actions (`issueMultiItemVoucherAction`, `editVoucher`, `voidVoucher`, `createRefund`, `registerParticipant`, `recordFormationLumpSumPayment`) lack route revalidation for `/list/daily-ledger` and `/list/revenue`.
5. **Milestone 5 (F11 - Known defects in current code)**:
   - `WorkshopSchedule.tsx`, `WorkshopAttendanceGrid.tsx`, `AttendanceGrid.tsx`, and `students/[id]/page.tsx` lack `timeZone: "Africa/Algiers"`.

---

## 4. Acceptance Criteria Verification

As milestones M1 through M5 are implemented by workers, running `npx tsx tests/e2e/run-all.ts` will progressively transition all 91 failing tests to **PASS**.

When Milestone 6 is reached, **100% of all 144 tests must pass**, providing objective, automated verification that:
- [x] All 12 features F1-F12 have >=5 tests in Tier 1 and Tier 2.
- [x] Cross-feature interactions are verified in Tier 3.
- [x] Real-world cashier workflows are verified in Tier 4.
- [x] Adversarial stress is verified in Tier 5.
- [x] Zero regressions occur across existing school management workflows.
