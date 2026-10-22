# Test Infrastructure Specification: Cross-Device Timezone, Voucher, Ledger & Cache Synchronization

## 1. Overview & Architecture

This test infrastructure provides an authoritative, opaque-box, requirement-driven test suite designed to verify and prevent regressions for Requirements **R1 through R5** as defined in `ORIGINAL_REQUEST.md` and detailed in `PROJECT.md`.

The suite operates across five distinct tiers:
- **Tier 1: Feature Coverage** (>=5 test cases per feature for all 12 features F1–F12 = 60+ test cases).
- **Tier 2: Boundary & Corner Cases** (>=5 boundary cases per feature = 60+ test cases: local midnight 00:00:00, 00:59:59, 23:59:59, null/undefined timestamps, month-end/year-end transitions, leap years, timezone offsets UTC, UTC+1, UTC+2, UTC-5).
- **Tier 3: Cross-Feature Combinations** (Pairwise and multi-feature interaction tests: voucher issuance + ledger upsert + cache revalidation; thermal ticket print + client timezone offset; today filter + ledger query; DZD formatting + ticket output).
- **Tier 4: Real-World Application Scenarios** (Complete end-to-end cashier and branch administration workflows: midnight voucher issuance and ticket printing; voucher voiding and ledger update; multi-item enrollment and daily breakdown; workshop registration and seat assignment).
- **Tier 5: Adversarial Hardening** (Extreme boundary stress, injection prevention, non-standard locale formatting, malformed date string handling, currency precision limits).

---

## 2. Requirement & Feature Matrix

| Req | Feature ID | Feature Name | Target Modules | Primary Tier 1-4 Test Suites |
|---|---|---|---|---|
| **R1** | **F1** | Centralized Algiers Date/Time Engine | `src/lib/algiersDate.ts` | `tier1-features/f01-algiers-date-engine.test.ts` |
| **R4** | **F2** | Deterministic Currency & SSR Locale Formatting | `src/lib/algiersDate.ts`, `next-intl` | `tier1-features/f02-deterministic-currency-ssr.test.ts` |
| **R2** | **F3** | Eliminate `"01/01/2026"` Hardcoded Fallbacks | `src/lib/voucherUtils.ts` | `tier1-features/f03-eliminate-2026-fallbacks.test.ts` |
| **R2** | **F4** | Consistent Voucher Labels Across Screens | `src/lib/revenue.ts`, `RevenuePaymentsTable.tsx`, `PaymentGrid.tsx` | `tier1-features/f04-voucher-labels-across-screens.test.ts` |
| **R2** | **F5** | Standardize Thermal & Printable Tickets | `PaymentTicket.tsx`, `WorkshopTicket.tsx`, `PrintWorkshopTicketButton.tsx`, `PayslipTicket.tsx` | `tier1-features/f05-thermal-printable-tickets.test.ts` |
| **R3** | **F6** | Ledger 00:00–01:00 AM Boundary Normalization | `src/lib/ledger.ts`, `scripts/sync-database-payments.js` | `tier1-features/f06-ledger-midnight-boundary.test.ts` |
| **R3** | **F7** | Revenue Query Business-Day Window Alignment | `src/lib/revenue.ts` | `tier1-features/f07-revenue-business-day-window.test.ts` |
| **R3** | **F8** | Algiers-Anchored "Today" Filter & Date Pickers | `RevenueFilterBar.tsx`, `daily-ledger/page.tsx` | `tier1-features/f08-today-filter-date-pickers.test.ts` |
| **R5** | **F9** | Unified Financial Cache Revalidation Helper | `src/lib/revalidation.ts` | `tier1-features/f09-unified-revalidation-helper.test.ts` |
| **R5** | **F10** | Mutating Server Actions Revalidation | `src/lib/actions.ts`, `src/lib/formationActions.ts`, `src/lib/financeActions.ts` | `tier1-features/f10-mutating-actions-revalidation.test.ts` |
| **R1** | **F11** | Cross-Device Schedule & Attendance Timezone | `WorkshopSchedule.tsx`, `AttendanceGrid.tsx`, `BigCalender.tsx` | `tier1-features/f11-schedules-attendance-timezone.test.ts` |
| **All** | **F12** | Comprehensive E2E Test Suite & Hardening | Test runner, full suite execution | `tier1-features/f12-e2e-adversarial-hardening.test.ts` |

---

## 3. Test Runner & Execution Commands

The test runner utilizes project-native `tsx` (`npx tsx`) to provide fast, deterministic, cross-platform TypeScript execution without requiring extra heavy test dependencies.

### 3.1 Run Full Test Suite (All Tiers 1–5)
```powershell
npx tsx tests/e2e/run-all.ts
```

### 3.2 Run Specific Tiers
- **Tier 1 (Feature Coverage)**:
  ```powershell
  npx tsx tests/e2e/tier1-features/run-tier1.ts
  ```
- **Tier 2 (Boundary & Corner Cases)**:
  ```powershell
  npx tsx tests/e2e/tier2-boundaries/boundary-corner-cases.test.ts
  ```
- **Tier 3 (Cross-Feature Combinations)**:
  ```powershell
  npx tsx tests/e2e/tier3-combinations/cross-feature-combinations.test.ts
  ```
- **Tier 4 (Real-World Workflows)**:
  ```powershell
  npx tsx tests/e2e/tier4-scenarios/real-world-workflows.test.ts
  ```
- **Tier 5 (Adversarial Hardening)**:
  ```powershell
  npx tsx tests/e2e/tier5-adversarial/adversarial-stress.test.ts
  ```

---

## 4. Test Suite Directory Structure

```
tests/e2e/
├── helpers/
│   ├── runner.ts                 # Test harness with assertions, timing, formatted reporting
│   ├── moduleLoader.ts           # Safe module dynamic importer with diagnostic error reporting
│   ├── timezoneSimulator.ts      # Multi-timezone client environment simulator (UTC, UTC+2, UTC-5)
│   └── mockData.ts               # Controlled mock datasets for vouchers, ledgers, lessons
├── tier1-features/
│   ├── f01-algiers-date-engine.test.ts
│   ├── f02-deterministic-currency-ssr.test.ts
│   ├── f03-eliminate-2026-fallbacks.test.ts
│   ├── f04-voucher-labels-across-screens.test.ts
│   ├── f05-thermal-printable-tickets.test.ts
│   ├── f06-ledger-midnight-boundary.test.ts
│   ├── f07-revenue-business-day-window.test.ts
│   ├── f08-today-filter-date-pickers.test.ts
│   ├── f09-unified-revalidation-helper.test.ts
│   ├── f10-mutating-actions-revalidation.test.ts
│   ├── f11-schedules-attendance-timezone.test.ts
│   ├── f12-e2e-adversarial-hardening.test.ts
│   └── run-tier1.ts
├── tier2-boundaries/
│   └── boundary-corner-cases.test.ts
├── tier3-combinations/
│   └── cross-feature-combinations.test.ts
├── tier4-scenarios/
│   └── real-world-workflows.test.ts
├── tier5-adversarial/
│   └── adversarial-stress.test.ts
└── run-all.ts                     # Master E2E runner aggregating all tiers
```

---

## 5. Interface Contracts Verified

### 5.1 `src/lib/algiersDate.ts` (M1)
- `ALGIERS_TIMEZONE === "Africa/Algiers"`
- `getAlgiersDateInfo(dateInput?: Date | string | number | null): AlgiersDateInfo`
- `getAlgiersTodayDateString(): string`
- `getAlgiersDayBounds(dateInput?: Date | string | number | null): AlgiersDayBounds`
- `normalizeDateToAlgiersStartOfDay(dateInput: Date | string | number): Date`
- `formatAlgiersDate(dateInput, locale?, options?): string`
- `formatAlgiersTime(dateInput, locale?): string`
- `formatAlgiersDateTime(dateInput, locale?): string`
- `formatDZD(amount, locale?): string`

### 5.2 `src/lib/voucherUtils.ts` (M2)
- Zero occurrences of string `"01/01/2026"`.
- `formatPaymentDate(null | undefined | invalid)` returns `""` or `"—"`.
- `formatPaymentDateTime(null | undefined | invalid)` returns `""` or `"—"`.
- `formatVoucherDisplay(null | undefined)` returns safe empty or dash string.
- Proper series, branch, level labels in formatted vouchers.

### 5.3 `src/lib/ledger.ts` (M3)
- `normalizeDateToStartOfDay(date)`: Must attribute timestamps between 00:00:00 and 00:59:59 Algiers time ($D-1\text{ 23:00Z}$ to $D-1\text{ 23:59:59.999Z}$) to day $D$ (returning $D\text{ 00:00:00.000Z}$), never $D-1$.
- `syncDailyLedgerFromVouchers()`: Aggregates ledger rows using Algiers business day.

### 5.4 `src/lib/revenue.ts` (M3)
- Daily revenue query window for business day $D$:
  - `startUtc`: $D-1\text{ 23:00:00.000Z}$
  - `endUtc`: $D\text{ 22:59:59.999Z}$
- Daily branch ledger query includes midnight vouchers issued at 00:30 AM local time.

### 5.5 `src/lib/revalidation.ts` (M4)
- `revalidateFinancialRoutes(targets?: FinancialRevalidationTargets)`:
  - Consistently invalidates `/list/daily-ledger`, `/list/revenue`, `/list/finance`, `/list/payments`, `/list/attendance`, `/admin`, plus contextual subroutes (`classId`, `studentId`, `workshopId`, `branchId`).

---

## 6. Progressive Testability & Defect Reporting

When running the test suite:
1. **Unimplemented Modules**: If a module planned for a future milestone (such as `src/lib/algiersDate.ts` in M1 or `src/lib/revalidation.ts` in M4) does not yet exist, tests safely detect its absence and fail with a clear diagnostic message indicating the pending milestone.
2. **Defects in Existing Code**: Tests for existing modules (such as the `"01/01/2026"` fallbacks in `src/lib/voucherUtils.ts` and the UTC midnight bug in `src/lib/ledger.ts`) actively fail against the contracts, validating that the test suite detects real defects.
3. **Milestone Completion Verification**: As implementing workers complete each milestone, the corresponding tests transition from FAIL to PASS without altering any test logic.
