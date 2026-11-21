# Orçamento Doméstico Thiago & Laina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared household-budget web app for Thiago and Laina (payslips, incomes, expenses with paid checkmarks, a Jan–Dec grid, credit cards with AI-read PDF invoices and projected installments, a dashboard, and export to Google Sheets), backed by Supabase and deployed on Vercel.

**Architecture:** Vite + React SPA talks directly to Supabase (Postgres + Auth + Storage, Row Level Security per household). All money and month rules live in pure TypeScript modules under `src/domain/` (unit-tested with Vitest); screens only render what those modules compute. One Vercel serverless function (`api/parse-invoice.ts`) sends the PDF to Gemini and returns validated JSON; nothing is written until the user confirms on the review screen, and the save is one atomic Postgres function.

**Tech Stack:** TypeScript 5.8, React 19, Vite 6, Tailwind CSS 4, React Router 7, TanStack Query 5, @supabase/supabase-js 2, Supabase CLI (local dev, migrations, pgTAP), Recharts 3, Zod 3, @google/genai, Google Identity Services + Sheets REST API, Vitest + Testing Library, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-21-orcamento-domestico-design.md` (reference images in `docs/superpowers/specs/img/`, the original Gemini prompt in `docs/reference/aistudio-server.ts`, visual mockup A at https://claude.ai/artifact/6P8KYE1HNiAr9v1aNAjxGZ).

## Global Constraints

- UI copy in Portuguese (pt-BR). Money shown as `11.835,24` (pt-BR, 2 decimals); with symbol `R$ 11.835,24`.
- Money in TypeScript is integer **cents** (`Cents`); in Postgres `numeric(12,2)`. Convert only at the data layer.
- A month is always year + month: `Month` = `'YYYY-MM'` string in TS; `date` (day 1) in Postgres. Never a 0–11 index without a year.
- An invoice belongs to the month of its **due date** (`due_month`) in every total and grid. One invoice per `(card_id, due_month)`.
- Cards store only `last4` (`char(4)`, digits only) — never a full card number.
- Every table carries `household_id`; RLS allows access only to members of that household. One household per installation.
- The Gemini key (`GEMINI_API_KEY`, free tier) exists only in the serverless function's environment, never in client bundles (`VITE_*`).
- AI output is never persisted without the user confirming the review screen.
- Nothing the user created is deleted implicitly: cards are archived, not deleted, once they have invoices; re-importing an invoice replaces it only after confirmation.
- Desktop-first layout (min content width 1024px); no mobile-specific work.
- Visual direction A "Claro e sereno": tokens `--bg #f3f6f5`, `--fg #16302b`, `--muted #5f7570`, `--line #e1e8e6`, `--card #ffffff`, `--accent #0f7a64`, `--accent-soft #e2f1ec`, `--good #0f7a64`, `--warn #c9774d`; font Manrope (Google Fonts) for everything; left sidebar nav; radius 14px cards / 10px inner. Category palette (in order): `#0f7a64 #3d9c87 #74bba9 #a8d6ca #e0a458 #c9774d #8a6fb0 #5b8def #9aa5ba`.
- Initial categories: Moradia, Saúde, Telefonia, Streamings, Educação, Alimentação, Transporte, Lazer, Outras.

## Review Focus

1. **Installment plan crossing the year boundary** (10x whose 1st installment is due 2026-11): the grid for 2027 shows installments 3–10 Jan–Aug 2027 as projected, and importing the 2027-01 invoice links item 03/10 to the same plan instead of creating a second one. → tests in Task 6 (`projects across year boundary`, `links 03/10 in next year`).
2. **Same invoice imported twice** (user re-uploads the November PDF): totals and items do not double; the old invoice and its items are replaced; plans created by the first import are reused, not duplicated. → pgTAP test in Task 3 (`save_imported_invoice replaces`) and domain test in Task 6.
3. **Refunds and advance payments** (negative items, "pagamento antecipado"): negative amounts are kept as negative items, the review screen shows `itens − total` as an "Ajuste" line, and the saved invoice total is the PDF's total, not the item sum. → tests in Task 10 (`adjustment line includes refunds`).
4. **Due day that does not exist in the month** (card due day 31, or 30 in February): due date clamps to the month's last day, never rolls into the next month. → test in Task 2 (`dueDateFor clamps`).
5. **Gemini failure modes** (429 free-tier limit, timeout, PDF over 3 MB, model returns malformed JSON): the user sees a specific Portuguese message, can retry, and nothing is saved. → tests in Task 9 (`maps 429`, `rejects oversized`, `rejects invalid json`).

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, vercel.json, index.html, .env.example
src/
  main.tsx, App.tsx                      # router + QueryClient + AuthGate
  styles.css                             # Tailwind import + design tokens (Global Constraints)
  domain/                                # pure logic, no React, no Supabase
    types.ts                             # all domain types (Task 2)
    month.ts, money.ts                   # Task 2
    payslip.ts, incomes.ts               # Task 4
    expenses.ts                          # Task 5
    installments.ts                      # Task 6 (projection, reconciliation, limit used)
    grid.ts                              # Task 11 (monthly grid + totals)
    dashboard.ts                         # Task 13
    sheetExport.ts                       # Task 14
    *.test.ts                            # next to each module
  data/
    supabase.ts                          # client (Task 3)
    mappers.ts                           # DB row <-> domain (cents, months) (Task 3)
    snapshot.ts                          # fetchSnapshot + useSnapshot (Task 3)
    mutations.ts                         # one function per write (grows per feature task)
    auth.tsx                             # AuthProvider, useAuth, LoginPage (Task 3)
  ui/                                    # Layout, Sidebar, Money, Badge, Modal, MonthPicker (Task 1)
  features/
    incomes/  expenses/  cards/  import/  grid/  dashboard/  export/
api/
  parse-invoice.ts                       # Vercel function (Task 9)
  _lib/parseInvoice.ts, _lib/prompt.ts   # testable core (Task 9)
supabase/
  config.toml
  migrations/20261121000001_schema.sql, ..._rls.sql, ..._functions.sql
  seed.sql
  tests/rls.test.sql, tests/import.test.sql
docs/setup-guide.md                      # Thiago's step-by-step (Tasks 3, 9, 14, 15)
```

Shared data-flow decision: the household's data is small, so the app loads one **snapshot** (all rows of the household) through a single TanStack Query key `['snapshot']`; every mutation invalidates it. Domain functions take the snapshot (or parts of it) as input.

Decision vs. spec §8.2: **projected installments are computed, not stored.** `invoice_items.source` is `'imported' | 'manual'` only; projections come from `installment_plans` minus installments already present as real items. This makes "projected and real counted twice" impossible by construction. Likewise, fixed-expense monthly entries are **virtual** until the user changes one (amount or paid), then upserted into `expense_entries`.

Additions to spec §8.2 required by §8.6/§8.6.1: `expenses.payment_method ('cash'|'card')`, `expenses.card_id`, `expenses.person_id` (whose payslip a payroll deduction comes from); `invoices.due_month`, `invoices.source ('pdf'|'manual')`; `invoice_items.expense_id`; table `sheet_exports (user_id, year, spreadsheet_id, url)`.

---

### Task 1: Project scaffold, design tokens and app shell

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/ui/Layout.tsx`, `src/ui/Sidebar.tsx`, `src/ui/Money.tsx`
- Test: `src/ui/Sidebar.test.tsx`

**Interfaces:**
- Produces: `<Layout>` (sidebar + `<Outlet/>`); routes `/` (Painel), `/mes-a-mes`, `/receitas`, `/despesas`, `/cartoes`, `/login`; `<Money cents={number} symbol?: boolean />`; npm scripts `dev`, `build`, `test` (vitest run), `lint` (tsc --noEmit).

- [ ] **Step 1:** Scaffold Vite React-TS; add dependencies from Tech Stack; Tailwind 4 via `@tailwindcss/vite`; Vitest with jsdom + Testing Library; `.gitignore` includes `.env*` except `.env.example`, `.superpowers/`, `supabase/.temp`, `*.pdf`.
- [ ] **Step 2: Write the failing test** `src/ui/Sidebar.test.tsx`:

```tsx
test('sidebar lists the five sections in order', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(
    ['Painel', 'Mês a mês', 'Receitas e contracheques', 'Despesas', 'Cartões']);
});
```

- [ ] **Step 3:** Run `npm test` — Expected: FAIL (Sidebar not found).
- [ ] **Step 4:** Implement `styles.css` tokens (Global Constraints, as CSS variables + Tailwind theme), Manrope link in `index.html`, `Sidebar` (brand "Orçamento da Casa" / "Thiago & Laina", active item uses `--accent-soft`), `Layout`, router in `App.tsx` with placeholder pages.
- [ ] **Step 5:** Run `npm test && npm run lint && npm run build` — Expected: all pass.
- [ ] **Step 6:** Commit `feat: scaffold app shell with design tokens`.

---

### Task 2: Domain types, months and money

**Files:**
- Create: `src/domain/types.ts`, `src/domain/month.ts`, `src/domain/money.ts`
- Test: `src/domain/month.test.ts`, `src/domain/money.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```ts
export type Month = string;            // 'YYYY-MM'
export type Cents = number;            // integer
export interface Person { id: string; name: string }
export interface PayslipLine { kind: 'provento' | 'desconto'; label: string; amountCents: Cents; order: number }
export interface Payslip { id: string; personId: string; validFrom: Month; lines: PayslipLine[] }
export interface Income { id: string; name: string; personId: string | null; grossCents: Cents | null;
  discountCents: Cents | null; discountLabel: string | null; defaultCents: Cents;
  startMonth: Month; endMonth: Month | null; overrides: Record<Month, Cents> }
export interface Expense { id: string; name: string; category: string; isFixed: boolean; defaultCents: Cents;
  dueDay: number | null; payrollDeducted: boolean; personId: string | null;
  paymentMethod: 'cash' | 'card'; cardId: string | null; startMonth: Month; endMonth: Month | null; notes: string | null }
export interface ExpenseEntry { expenseId: string; month: Month; amountCents: Cents; paid: boolean; paidAt: string | null }
export interface Card { id: string; name: string; bank: string; brand: string; last4: string | null;
  holderPersonId: string | null; limitCents: Cents; closingDay: number; dueDay: number; color: string; archived: boolean }
export interface Invoice { id: string; cardId: string; dueMonth: Month; dueDate: string; totalCents: Cents;
  paid: boolean; paidAt: string | null; pdfPath: string | null; source: 'pdf' | 'manual' }
export interface InvoiceItem { id: string; invoiceId: string; date: string | null; description: string; amountCents: Cents;
  category: string; installmentN: number | null; installmentTotal: number | null; planId: string | null; expenseId: string | null }
export interface InstallmentPlan { id: string; cardId: string; description: string; installmentCents: Cents;
  totalInstallments: number; firstDueMonth: Month; purchaseDate: string | null }
export interface Snapshot { people: Person[]; payslips: Payslip[]; incomes: Income[]; expenses: Expense[];
  entries: ExpenseEntry[]; cards: Card[]; invoices: Invoice[]; items: InvoiceItem[]; plans: InstallmentPlan[]; categories: string[] }
```

- Produces (`month.ts`): `toMonth(d: Date | string): Month`, `addMonths(m: Month, n: number): Month`, `monthsOfYear(year: number): Month[]`, `compareMonth(a: Month, b: Month): number`, `monthLabel(m: Month): string` (`'Nov/2026'`), `monthShort(m: Month): string` (`'NOV'`), `dueDateFor(m: Month, day: number): string` (`'YYYY-MM-DD'`), `currentMonth(): Month`.
- Produces (`money.ts`): `formatBRL(c: Cents, opts?: { symbol?: boolean }): string`, `toCents(reais: number): Cents` (`Math.round(reais * 100)`), `parseBRL(s: string): Cents | null`, `fromCents(c: Cents): number`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(addMonths('2026-11', 3)).toBe('2027-02');
expect(addMonths('2027-01', -1)).toBe('2026-12');
expect(monthsOfYear(2026)).toHaveLength(12);
expect(monthsOfYear(2026)[0]).toBe('2026-01');
expect(toMonth('2026-11-21')).toBe('2026-11');
expect(monthLabel('2026-11')).toBe('Nov/2026');
test('dueDateFor clamps', () => {
  expect(dueDateFor('2027-02', 31)).toBe('2027-02-28');
  expect(dueDateFor('2028-02', 30)).toBe('2028-02-29');
  expect(dueDateFor('2026-11', 10)).toBe('2026-11-10');
});
expect(formatBRL(1183524)).toBe('11.835,24');
expect(formatBRL(1183524, { symbol: true })).toBe('R$ 11.835,24');
expect(formatBRL(-60000)).toBe('-600,00');
expect(toCents(2581.24)).toBe(258124);
expect(parseBRL('1.234,56')).toBe(123456);
expect(parseBRL('1234,5')).toBe(123450);
expect(parseBRL('-12,30')).toBe(-1230);
expect(parseBRL('abc')).toBeNull();
```

- [ ] **Step 2:** Run `npx vitest run src/domain` — Expected: FAIL.
- [ ] **Step 3:** Implement. Month math on integers (year*12+month), never `Date` arithmetic across time zones. `formatBRL` uses `Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2})` on `c/100`, symbol variant prefixes `'R$ '` (normalize the non-breaking space Intl may emit to a plain space).
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat: domain types, month and money helpers`.

---

### Task 3: Supabase schema, RLS, seed, auth and snapshot

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261121000001_schema.sql`, `supabase/migrations/20261121000002_rls.sql`, `supabase/seed.sql`, `supabase/tests/rls.test.sql`, `src/data/supabase.ts`, `src/data/mappers.ts`, `src/data/snapshot.ts`, `src/data/auth.tsx`, `src/data/mutations.ts`, `docs/setup-guide.md`
- Modify: `src/App.tsx` (wrap routes in `AuthProvider` + redirect to `/login`)
- Test: `supabase/tests/rls.test.sql`, `src/data/mappers.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces: tables (snake_case of the Task 2 fields + `household_id uuid not null`, `id uuid default gen_random_uuid()`): `households`, `household_members(user_id, household_id)`, `people`, `payslips`, `payslip_lines`, `incomes`, `income_overrides(income_id, month, amount)` unique `(income_id, month)`, `expenses`, `expense_entries` unique `(expense_id, month)`, `cards` (`last4 char(4) check (last4 ~ '^[0-9]{4}$')`), `invoices` unique `(card_id, due_month)`, `invoice_items` (`on delete cascade` from invoices), `installment_plans`, `categories(name)` unique `(household_id, name)`, `sheet_exports(user_id, household_id, year, spreadsheet_id, url)` unique `(user_id, year)`. SQL function `is_member(hid uuid) returns boolean` (security definer, `stable`). Storage bucket `invoices` (private), objects path `{household_id}/{invoice_id}.pdf`.
- Produces (TS): `supabase` client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); `useAuth(): { session, signIn(email, pw), signOut() }`; `useHouseholdId(): string`; `fetchSnapshot(householdId): Promise<Snapshot>`; `useSnapshot(): UseQueryResult<Snapshot>` key `['snapshot']`; mapper functions `rowToX`/`xToRow` for each entity (numeric ↔ cents, date ↔ Month).

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/rls.test.sql`: create two households with one user each; as user A (`set local role authenticated; set local request.jwt.claims ...`) `select count(*) from expenses` returns only A's rows; insert into B's household fails; `insert into cards (last4) values ('1234567890123456')` fails the check.
- [ ] **Step 2:** Run `supabase start && supabase test db` — Expected: FAIL (tables missing).
- [ ] **Step 3:** Write schema + RLS migrations: every table `enable row level security`, policy `using (is_member(household_id)) with check (is_member(household_id))` for all commands; storage policy on `invoices` bucket where `(storage.foldername(name))[1]::uuid` is a household the user belongs to.
- [ ] **Step 4:** Run `supabase db reset && supabase test db` — Expected: PASS.
- [ ] **Step 5:** Write `seed.sql`. It must be re-runnable on production through the SQL editor, so it does nothing if a household exists, and it links members by looking up the two e-mails set at the top (`\set` not available in the editor — use a `do $$ declare thiago_email text := 'TROCAR'; laina_email text := 'TROCAR'; ... $$`). Seed data (amounts in reais):
  - people: Thiago, Laina; categories: the nine in Global Constraints.
  - payslip Thiago, `valid_from` = first month of the current year: proventos Soldo Militar da Ativa 9546.00, Adicional de Habilitação 4295.70, Adicional Militar 2100.12, Adicional de Disponibilidade 1145.52; descontos Imposto de Renda (IRRF) 3235.80, Pensão Militar Obrigatória 1794.17, Assistência Médica Hospitalar (FAMHS) 222.13.
  - payslip Laina: proventos 12546.00, 5295.70, 2100.12, 1145.52 (same labels); descontos IRRF 6000.00, Pensão Militar 1794.17, FAMHS 222.13.
  - income "Remuneração Ministério da Defesa", person Laina, gross 2000.00, discount 600.00 label "Imposto de Renda", default 1400.00.
  - fixed cash expenses `(name, category, default, due_day, payroll_deducted, person)`: Internet/claro, Moradia, 260.84, 10, no · PNR, Moradia, 665.94, 5, yes, null · Condomínio SQS 214, Moradia, 1000.00, 10, no · Conta de energia, Moradia, 400.00, 15, no · Plano de saúde Laina/Valentina, Saúde, 2581.24, 10, yes, Laina · Plano de saúde Thiago, Saúde, 677.37, 10, yes, Thiago · Claro celular Laina, Telefonia, 101.90, 15, no · Claro celular Valentina, Telefonia, 30.00, 15, no · Claro Thiago, Telefonia, 119.00, 15, no · Taya Advogados, Outras, 37.00, 10, yes, null · Clube da Aeronáutica, Outras, 260.00, 10, yes, null.
  - No cards (they register their own).
- [ ] **Step 6: Write the failing mapper test** `src/data/mappers.test.ts`: `rowToExpense({default_amount: '2581.24', start_month: '2026-01-01', ...}).defaultCents === 258124` and `.startMonth === '2026-01'`; `expenseToRow` inverts it.
- [ ] **Step 7:** Implement `supabase.ts`, `mappers.ts`, `snapshot.ts` (parallel selects, map, assemble `Snapshot`), `auth.tsx` (`LoginPage` with e-mail + senha, error "E-mail ou senha incorretos."; no sign-up UI). Run `npm test` — Expected: PASS.
- [ ] **Step 8:** Write `docs/setup-guide.md` part 1 (Portuguese, for Thiago): create Supabase project; link CLI and `supabase db push`; Auth → add the two users; Auth settings → disable sign-ups; run `seed.sql` in SQL editor after replacing the two e-mails; copy URL + anon key to `.env.local`; note that PNR, Taya and Clube have no person yet (set it in Despesas).
- [ ] **Step 9:** Manual check: `npm run dev`, log in as the seeded local user, browser console shows snapshot with 11 expenses. Commit `feat: supabase schema, rls, seed, auth and snapshot`.

---

### Task 4: Payslip and income rules

**Files:**
- Create: `src/domain/payslip.ts`, `src/domain/incomes.ts`
- Test: `src/domain/payslip.test.ts`, `src/domain/incomes.test.ts`

**Interfaces:**
- Consumes: Task 2 types. `depositedCents` takes the deduction amounts directly (callers get them from Task 5's `payrollDeductionsFor`).
- Produces:
  - `payslipFor(payslips: Payslip[], personId: string, m: Month): Payslip | null` — greatest `validFrom ≤ m`.
  - `payslipTotals(p: Payslip): { proventosCents: Cents; descontosCents: Cents; liquidoCents: Cents }`.
  - `depositedCents(liquidoCents: Cents, payrollDeductionsCents: Cents[]): Cents`.
  - `incomeFor(income: Income, m: Month): Cents | null` — null outside `[startMonth, endMonth]`; override wins over default.
  - `incomeRowsFor(s: Snapshot, m: Month): { key: string; label: string; personId: string | null; cents: Cents }[]` — one row per person with a payslip (`'Salário Líquido Thiago'`), then each active income.

- [ ] **Step 1: Write the failing tests** with the spec's real values:

```ts
expect(payslipTotals(thiago)).toEqual({ proventosCents: 1708734, descontosCents: 525210, liquidoCents: 1183524 });
expect(payslipTotals(laina)).toEqual({ proventosCents: 2108734, descontosCents: 801630, liquidoCents: 1307104 });
// thiago2 validFrom '2026-07' replaces thiago (validFrom '2026-01') from July on
expect(payslipFor([thiago, thiago2], 'p-thiago', '2026-06')?.id).toBe(thiago.id);
expect(payslipFor([thiago, thiago2], 'p-thiago', '2026-07')?.id).toBe(thiago2.id);
expect(payslipFor([thiago], 'p-thiago', '2025-12')).toBeNull();
expect(depositedCents(1183524, [67737])).toBe(1115787);
expect(incomeFor(defesa, '2026-05')).toBe(140000);
expect(incomeFor({ ...defesa, overrides: { '2026-05': 150000 } }, '2026-05')).toBe(150000);
expect(incomeFor({ ...defesa, endMonth: '2026-03' }, '2026-04')).toBeNull();
expect(incomeRowsFor(snap, '2026-11').map(r => r.cents)).toEqual([1183524, 1307104, 140000]);
```

- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: payslip and income rules`.

---

### Task 5: Expense entry rules

**Files:**
- Create: `src/domain/expenses.ts`
- Test: `src/domain/expenses.test.ts`

**Interfaces:**
- Produces:
  - `isActiveIn(e: Expense, m: Month): boolean` — fixed: `startMonth ≤ m ≤ endMonth?`; non-fixed: `m === startMonth`.
  - `entryFor(e: Expense, entries: ExpenseEntry[], m: Month): ExpenseEntry | null` — null if inactive; persisted entry wins; otherwise virtual `{ amountCents: defaultCents, paid: payrollDeducted, paidAt: null }`. A payroll-deducted expense is always `paid: true` even if a persisted entry says otherwise.
  - `cashExpensesFor(s: Snapshot, m: Month): { expense: Expense; entry: ExpenseEntry }[]` — `paymentMethod === 'cash'` only.
  - `cardFixedExpensesFor(s: Snapshot, cardId: string, m: Month): { expense: Expense; entry: ExpenseEntry }[]`.
  - `payrollDeductionsFor(s: Snapshot, personId: string, m: Month): Cents[]`.

- [ ] **Step 1: Write the failing tests:** fixed expense started 2026-01 is active 2026-11 and inactive 2025-12; ended 2026-06 inactive 2026-07; one-off active only in its month; virtual entry for Condomínio is `{amountCents: 100000, paid: false}`; persisted `{paid: true, amountCents: 98000}` wins; PNR is paid with no entry and stays paid even with a persisted `paid:false`; a card expense is excluded from `cashExpensesFor` and included in `cardFixedExpensesFor(s, card.id, m)`; `payrollDeductionsFor(s, 'p-thiago', '2026-11')` equals `[67737]`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: expense entry rules`.

---

### Task 6: Installments — projection, reconciliation, limit used

**Files:**
- Create: `src/domain/installments.ts`
- Test: `src/domain/installments.test.ts`

**Interfaces:**
- Produces:
  - `normalizeDescription(s: string): string` — uppercase, strip accents, drop installment suffixes (`/\b\d{1,2}\s*(\/|DE)\s*\d{1,2}\b/`, `PARC`), collapse non-alphanumerics to single spaces, trim.
  - `descriptionsMatch(a: string, b: string): boolean` — after normalizing: equal, or one contains the other, or token Jaccard ≥ 0.5.
  - `installmentDueMonth(p: InstallmentPlan, n: number): Month` — `addMonths(firstDueMonth, n - 1)`.
  - `type ProjectedItem = { planId: string; cardId: string; description: string; amountCents: Cents; installmentN: number; installmentTotal: number; dueMonth: Month }`.
  - `projectedItemsFor(plans: InstallmentPlan[], items: InvoiceItem[], invoices: Invoice[], cardId: string, dueMonth: Month): ProjectedItem[]` — plan installments due that month that have no real item with the same `planId` + `installmentN`.
  - `type ParsedItem = { date: string | null; description: string; amountCents: Cents; category: string; installmentN: number | null; installmentTotal: number | null }`.
  - `type PlanAction = { type: 'link'; planId: string } | { type: 'create'; firstDueMonth: Month } | null`.
  - `reconcile(items: ParsedItem[], plans: InstallmentPlan[], expenses: Expense[], cardId: string, dueMonth: Month): (ParsedItem & { planAction: PlanAction; expenseId: string | null })[]` — for items with `n/N`: expected first month `addMonths(dueMonth, -(n-1))`; link to a plan of the same card with same `totalInstallments`, `|installmentCents − amount| ≤ 1`, same `firstDueMonth`, `descriptionsMatch`; otherwise `create`. Two items in one invoice may not link to the same plan (second one creates). Items without `n/N`: `expenseId` = first card-fixed expense of this card with `descriptionsMatch` and amount within 10%.
  - `futureInstallmentsCents(plans, items, invoices, cardId: string, after: Month): Cents` — sum of projected installments with `dueMonth > after`.
  - `cardLimitUsedCents(s: Snapshot, cardId: string, today: Month): Cents` — unpaid invoices' totals + `futureInstallmentsCents(…, latest invoice due month or today)`.

- [ ] **Step 1: Write the failing tests** (plan `tv`: card c1, "MAGAZINE LUIZA", 15000, 10x, first `2026-11`):

```ts
test('projects across year boundary', () => {
  expect(projectedItemsFor([tv], [], [], 'c1', '2027-01')[0].installmentN).toBe(3);
  expect(projectedItemsFor([tv], [], [], 'c1', '2027-08')[0].installmentN).toBe(10);
  expect(projectedItemsFor([tv], [], [], 'c1', '2027-09')).toEqual([]);
  expect(projectedItemsFor([tv], [], [], 'c1', '2026-10')).toEqual([]);
});
test('real item hides its projection', () => {
  expect(projectedItemsFor([tv], [{ ...item, planId: tv.id, installmentN: 3 }], [inv202701], 'c1', '2027-01')).toEqual([]);
});
test('links 03/10 in next year', () => {
  const [r] = reconcile([{ description: 'MAGALU MAGAZINE LUIZA', amountCents: 15001, installmentN: 3, installmentTotal: 10, date: null, category: 'Outras' }], [tv], [], 'c1', '2027-01');
  expect(r.planAction).toEqual({ type: 'link', planId: tv.id });
});
test('creates plan when amount differs by more than 1 cent', () => {
  const [r] = reconcile([{ ...p3, amountCents: 15003 }], [tv], [], 'c1', '2027-01');
  expect(r.planAction).toEqual({ type: 'create', firstDueMonth: '2026-11' });
});
test('re-import of same invoice links, never creates a second plan', () => {
  // tv already has a real item for n=3 in 2027-01 (first import)
  const [r] = reconcile([p3], [tv], [], 'c1', '2027-01');
  expect(r.planAction).toEqual({ type: 'link', planId: tv.id });
});
expect(normalizeDescription('Magazine Luíza 03/10')).toBe('MAGAZINE LUIZA');
expect(descriptionsMatch('NETFLIX.COM', 'Netflix')).toBe(true);
// fixed card expense Netflix 5590 on c1 → item 'NETFLIX.COM' 5590 gets expenseId
// limit used: unpaid invoice 2026-12 total 154137 + installments 2027-01..2027-08 of tv (8 × 15000) = 274137
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: installment projection and reconciliation`.

---

### Task 7: Receitas e contracheques screen

**Files:**
- Create: `src/features/incomes/IncomesPage.tsx`, `PayslipCard.tsx`, `PayslipEditor.tsx`, `OtherIncomes.tsx`
- Modify: `src/data/mutations.ts`
- Test: `src/features/incomes/PayslipCard.test.tsx`

**Interfaces:**
- Consumes: `payslipFor`, `payslipTotals`, `depositedCents`, `payrollDeductionsFor`, `incomeFor`, `useSnapshot`, `MonthPicker` (create in `src/ui/MonthPicker.tsx`: `{ value: Month; onChange(m: Month) }`).
- Produces (mutations): `savePayslip(personId: string, validFrom: Month, lines: PayslipLine[])` (insert new payslip; if one exists with the same `validFrom`, replace its lines), `upsertIncome(i: Omit<Income,'id'> & {id?: string})`, `setIncomeOverride(incomeId, m, cents | null)`, `endIncome(incomeId, endMonth)`.

- [ ] **Step 1: Write the failing test:** render `PayslipCard` for Thiago 2026-11 with seed data plus PNR person set to Thiago → shows "Total proventos R$ 17.087,34", "Total descontos - R$ 5.252,10", "Salário líquido R$ 11.835,24", and "Depositado na conta R$ 10.491,93" (11.835,24 − 665,94 PNR − 677,37 plano Thiago).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement layout per `img/contracheques-referencia.png` in visual A tokens: two cards side by side, proventos list, descontos list (values in `--warn` with leading "-"), líquido box, "Depositado na conta" muted line with tooltip "Líquido menos descontos opcionais em folha (PNR, planos, etc.)". `PayslipEditor` modal: editable rows (label, kind, valor via `parseBRL`), add/remove row, field "Vale a partir de" (`MonthPicker`, default current month). Other incomes list with "+ Adicionar outra receita" (name, pessoa, bruto, desconto, rótulo do desconto, líquido auto = bruto − desconto, editable) and per-month override.
- [ ] **Step 4:** Run tests — PASS. Manual: edit Thiago's payslip from 2026-12 and confirm November still shows the old líquido.
- [ ] **Step 5:** Commit `feat: incomes and payslips screen`.

---

### Task 8: Despesas screen

**Files:**
- Create: `src/features/expenses/ExpensesPage.tsx`, `ExpenseForm.tsx`
- Modify: `src/data/mutations.ts`
- Test: `src/features/expenses/ExpenseForm.test.tsx`

**Interfaces:**
- Produces (mutations): `upsertExpense(e)`, `endExpense(id, endMonth: Month)` (sets `end_month`; history kept), `deleteExpense(id)` (only allowed when it has no persisted entries; otherwise UI offers "Encerrar"), `setEntry(expenseId, m, patch: { amountCents?: Cents; paid?: boolean })` (upsert on `(expense_id, month)`, sets `paid_at = now()` when paid becomes true).

- [ ] **Step 1: Write the failing test:** in `ExpenseForm`, choosing "Forma de pagamento: Cartão" shows a required card select and hides "Descontada em folha"; checking "Descontada em folha" shows "De qual contracheque" (Thiago/Laina); submitting with valor "1.000,00" calls `onSubmit` with `defaultCents: 100000`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement form fields: nome, categoria (select + "Nova categoria…" inserts into `categories`), fixa (checkbox; label "Repete todo mês"), valor padrão, dia de vencimento, forma de pagamento (À vista / Cartão + card select), descontada em folha + pessoa, começa em (`MonthPicker`), observações. List grouped by categoria with badges "Fixa", "Em folha", "Cartão Nubank".
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat: expenses screen`.

---

### Task 9: Invoice parsing serverless function

**Files:**
- Create: `api/parse-invoice.ts`, `api/_lib/parseInvoice.ts`, `api/_lib/prompt.ts`, `vercel.json`
- Modify: `.env.example` (`GEMINI_API_KEY=`, `GEMINI_MODEL=gemini-flash-latest`, `SUPABASE_URL=`, `SUPABASE_ANON_KEY=`), `docs/setup-guide.md` (part 2: create Gemini key in AI Studio, free tier, where to paste it in Vercel)
- Test: `api/_lib/parseInvoice.test.ts`

**Interfaces:**
- Consumes: `ParsedItem` (Task 6), `toCents`.
- Produces:
  - HTTP `POST /api/parse-invoice`, header `Authorization: Bearer <supabase access token>`, body `{ fileBase64: string; cards: { id: string; name: string; bank: string; holder: string }[] }`.
  - 200 body `ParsedInvoice = { detectedBank: string; detectedHolder: string | null; suggestedCardId: string | null; dueDate: string; totalCents: Cents; advancePaymentCents: Cents; items: ParsedItem[] }`.
  - Errors `{ error: string }`: 401 "Sessão expirada. Entre novamente."; 413 "O PDF passa de 3 MB. Tente exportar a fatura de novo pelo app do banco."; 429 "O limite gratuito da IA foi atingido. Aguarde um minuto e tente de novo."; 502 "Não consegui ler esta fatura. Tente de novo ou lance o total à mão."; 504 on 50 s timeout, same text as 502.
  - `parseInvoicePdf(base64: string, cards: …, generate: (req) => Promise<string>): Promise<ParsedInvoice>` — throws `ParseError` with `status` (one of the codes above).

- [ ] **Step 1: Write the failing tests** with a fake `generate`:

```ts
test('maps model JSON to cents', async () => { /* generate returns {"totalAmount":1541.37,"transactions":[{"description":"MAGAZINE LUIZA","amount":150,"installmentInfo":"03/10",...}]} */
  const r = await parseInvoicePdf(b64, cards, fake);
  expect(r.totalCents).toBe(154137);
  expect(r.items[0]).toMatchObject({ amountCents: 15000, installmentN: 3, installmentTotal: 10 });
});
test('keeps refunds negative', …expect(r.items[1].amountCents).toBe(-4990));
test('maps 429', … generate rejects with { status: 429 } → ParseError status 429);
test('rejects oversized', … base64 of 3 MB + 1 byte → status 413, generate not called);
test('rejects invalid json', … generate returns 'not json' → status 502);
```

- [ ] **Step 2:** Run `npx vitest run api` — FAIL.
- [ ] **Step 3:** Implement. Port the system prompt and response schema from `docs/reference/aistudio-server.ts` into `prompt.ts` (keep its rules for `03/10`, refunds as negatives, advance payment, excluding previous-invoice payments; drop the `isCorrectCard`/month-index fields — the app derives the month from `dueDate`). Validate the model output with Zod before mapping. In the handler: verify the token with `supabase.auth.getUser(token)` (anon key client), method POST only, `maxDuration: 60` in `vercel.json`, model from `GEMINI_MODEL`.
- [ ] **Step 4:** Run — PASS. Manual (local `vercel dev` with Thiago's key): one real Nubank and one real Bradesco PDF return item counts and totals matching the PDFs. PDFs stay outside the repo.
- [ ] **Step 5:** Commit `feat: invoice parsing function`.

---

### Task 10: Cards screen, manual invoices and PDF import with review

**Files:**
- Create: `supabase/migrations/20261121000004_functions.sql`, `supabase/tests/import.test.sql`, `src/features/cards/CardsPage.tsx`, `CardForm.tsx`, `CardInvoices.tsx`, `ManualInstallmentForm.tsx`, `src/features/import/ImportInvoiceDialog.tsx`, `ReviewTable.tsx`, `review.ts`
- Modify: `src/data/mutations.ts`
- Test: `src/features/import/review.test.ts`, `supabase/tests/import.test.sql`

**Interfaces:**
- Consumes: `reconcile`, `projectedItemsFor`, `cardLimitUsedCents` (Task 6); `/api/parse-invoice` (Task 9); `dueDateFor`, `toMonth`.
- Produces:
  - SQL `save_imported_invoice(payload jsonb) returns uuid` (security invoker, one transaction): payload `{ household_id, card_id, due_month, due_date, total, source, pdf_path, items: [{ date, description, amount, category, installment_n, installment_total, expense_id, plan: {link: uuid} | {create: {first_due_month}} | null }] }`. Deletes any invoice with same `(card_id, due_month)` (items cascade), inserts invoice, creates new plans (`installment_amount = item amount`, `description = normalized`), inserts items with `plan_id`. Plans left with no items are kept (they still project).
  - `review.ts`: `adjustmentCents(totalCents: Cents, items: { amountCents: Cents }[]): Cents` (= total − sum); `buildSavePayload(…): object` matching the SQL payload.
  - mutations: `upsertCard`, `archiveCard(id)` (delete only when the card has no invoices), `saveManualInvoice(cardId, dueMonth, totalCents)` (calls `save_imported_invoice` with `source: 'manual'`, no items), `setInvoicePaid(invoiceId, paid)`, `createManualPlan(cardId, description, installmentCents, total, firstDueMonth)`, `importInvoice(payload, pdf: File)` (upload to `invoices/{household}/{uuid}.pdf`, then RPC).

- [ ] **Step 1: Write the failing pgTAP test** `import.test.sql`: `save_imported_invoice replaces` — calling it twice with the same card/due_month and 3 items leaves 1 invoice and 3 items; a `plan.create` item on the first call followed by `plan.link` to that plan on the second leaves exactly 1 plan.
- [ ] **Step 2: Write the failing unit test** `review.test.ts`:

```ts
test('adjustment line includes refunds', () => {
  expect(adjustmentCents(154137, [{ amountCents: 100000 }, { amountCents: -4990 }, { amountCents: 50000 }])).toBe(9127);
});
```

- [ ] **Step 3:** Run `supabase test db && npx vitest run src/features/import` — FAIL.
- [ ] **Step 4:** Implement the SQL function and `review.ts`; run — PASS.
- [ ] **Step 5:** Implement UI:
  - Cards page: one tile per active card (name, banco, titular, "•••• 1234", limite usado bar from `cardLimitUsedCents`, próxima fatura), buttons "Importar fatura (PDF)", "Lançar total à mão", "Compra parcelada"; invoice list per card by due month (total, paga ✓ toggle, origem PDF/manual, open items); archived cards hidden behind "Mostrar arquivados".
  - Import dialog: choose PDF (≤ 3 MB) → card select preselected from `suggestedCardId` → spinner "Lendo a fatura…" → review: header (cartão, vencimento editable, total editable), table rows editable (data, descrição, valor, categoria, parcela `n/N`), a badge per row: "Parcela de compra existente", "Nova compra parcelada (N parcelas)", "Conta fixa: Netflix"; footer "Soma dos itens", "Total da fatura", "Ajuste" (`adjustmentCents`, shown when ≠ 0). If an invoice for that card+month exists: warning "Já existe uma fatura de Dez/2026 para este cartão. Salvar vai substituí-la." Buttons "Salvar fatura" / "Cancelar". Errors from Task 9 shown verbatim with "Tentar de novo".
- [ ] **Step 6:** Manual: import the same PDF twice — one invoice remains; card limit used unchanged after the second import.
- [ ] **Step 7:** Commit `feat: cards, manual invoices and pdf import with review`.

---

### Task 11: Monthly grid model

**Files:**
- Create: `src/domain/grid.ts`
- Test: `src/domain/grid.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:

```ts
export type CellState = 'paid' | 'pending' | 'projected' | 'none';
export interface GridCell { cents: Cents; state: CellState }
export interface GridRow { key: string; kind: 'income' | 'expense' | 'card'; refId: string; label: string; sublabel?: string;
  cells: Record<Month, GridCell>; breakdown?: Record<Month, { category: string; cents: Cents }[]> }
export interface MonthTotals { incomeCents: Cents; paidCents: Cents; expectedCents: Cents; balanceCents: Cents }
export interface MonthlyGrid { year: number; months: Month[]; incomeRows: GridRow[]; expenseRows: GridRow[];
  totals: Record<Month, MonthTotals>; paidCountYear: number }
export function buildMonthlyGrid(s: Snapshot, year: number): MonthlyGrid;
```

  Rules: income rows from `incomeRowsFor`. Expense rows: one per cash expense active in any month of the year (cell from `entryFor`; `paid` → 'paid', otherwise 'pending'; inactive → 'none'). One card row per non-archived card: if an invoice with that `dueMonth` exists → `totalCents`, 'paid'/'pending'; else projected = `projectedItemsFor` + `cardFixedExpensesFor` amounts → 'projected' (or 'none' when 0). `breakdown` groups the month's real items (or projected ones) by category. `expectedCents` = sum of all expense and card cells ≠ 'none'; `paidCents` = sum of 'paid'; `balanceCents` = income − expected. `paidCountYear` = number of 'paid' cells in the year.

- [ ] **Step 1: Write the failing tests** on the seed snapshot plus card c1 with plan `tv` and invoice `2026-12` total 154137 unpaid: November total income 2630628; December card cell `{cents: 154137, state: 'pending'}`; in `buildMonthlyGrid(s, 2027)` the January card cell is `{cents: 15000, state: 'projected'}`; PNR cells are 'paid' all year; in a separate test, adding a card-paid fixed expense (Netflix 5590 on c1) creates no expense row and makes the January 2027 card cell 20590; `expectedCents` of 2026-11 equals the sum of the 11 seed expenses (613329) + card cell; `balanceCents = incomeCents − expectedCents`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: monthly grid model`.

---

### Task 12: Mês a mês screen

**Files:**
- Create: `src/features/grid/GridPage.tsx`, `GridTable.tsx`, `GridCell.tsx`
- Test: `src/features/grid/GridCell.test.tsx`

**Interfaces:**
- Consumes: `buildMonthlyGrid`; mutations `setEntry`, `setInvoicePaid`.
- Produces: route `/mes-a-mes?ano=2026`; `<ExportButton year />` slot in the header (filled by Task 14).

- [ ] **Step 1: Write the failing test:** a 'pending' cell renders the amount muted and, when clicked, calls `onTogglePaid`; a 'paid' cell renders "✓ 665,94"; a 'projected' cell renders italic with title "Previsto"; a 'none' cell renders "–" and is not clickable.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement per `img/visao-mensal-referencia.png` in visual A: sticky first column, year selector, sections "1. Receitas" (rows + "Total das receitas") and "2. Despesas" (rows + card rows with "Desmembrar" toggle per card row and "Desmembrar todos os cartões" button showing breakdown sub-rows), totals rows "Despesas pagas", "Despesas previstas", "Saldo previsto" (negative in `--warn`), badge "N lançamentos pagos no ano". Clicking a card cell with an invoice toggles paid; clicking a projected card cell opens Cartões for that card. Right-click/secondary action on an expense cell edits that month's amount (`setEntry`).
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat: month-by-month grid screen`.

---

### Task 13: Dashboard

**Files:**
- Create: `src/domain/dashboard.ts`, `src/features/dashboard/DashboardPage.tsx`, `Kpis.tsx`, `YearBars.tsx`, `CategoryDonut.tsx`, `BillsList.tsx`, `CardsSummary.tsx`
- Test: `src/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `buildMonthlyGrid`, `cardLimitUsedCents`, `futureInstallmentsCents`.
- Produces: `buildDashboard(s: Snapshot, m: Month): { kpis: { incomeCents; expensesCents; pendingCents; surplusCents; surplusPct: number }; bars: { month: Month; incomeCents; expensesCents; future: boolean }[]; bills: { label; sublabel; cents; paid: boolean; dueDay: number | null }[]; categories: { category: string; cents: Cents }[]; cards: { cardId; name; invoiceCents; limitUsedCents; limitCents; futureInstallmentsCents; openPlans: number }[] }`. `bills` = expense rows + card rows of month `m` sorted paid first then by due day. `categories` = cash entries by category + that month's card items (real or projected) by category, sorted desc, zero entries dropped. `surplusPct = round(surplus / income * 100)`.

- [ ] **Step 1: Write the failing test** on the Task 11 fixture for `2026-11`: `kpis.incomeCents = 2630628`; `kpis.surplusCents = incomeCents − expensesCents`; `pendingCents` = sum of unpaid bills; categories sorted descending and include 'Saúde' = 325861; `bars` has 12 entries for 2026 with `future` true for months after `currentMonth()`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `dashboard.ts`; run — PASS.
- [ ] **Step 4:** Implement the page exactly as mockup A (https://claude.ai/artifact/6P8KYE1HNiAr9v1aNAjxGZ): month chips (prev / current / next), four KPI tiles with "Sobra prevista" as the accent-filled tile, Recharts grouped bars (receitas `#9fd3c5`, despesas `#0f7a64`, future months at 45% opacity), "Contas de <mês>" list with checkboxes wired to `setEntry`/`setInvoicePaid`, donut + legend with the category palette, card tiles with limit bar and "Parcelas futuras já previstas: R$ X até <mês>".
- [ ] **Step 5:** Manual check against the mockup side by side. Commit `feat: dashboard`.

---

### Task 14: Export to Google Sheets

**Files:**
- Create: `src/domain/sheetExport.ts`, `src/features/export/ExportButton.tsx`, `src/features/export/googleSheets.ts`
- Modify: `src/features/grid/GridPage.tsx`, `index.html` (GIS script `https://accounts.google.com/gsi/client`), `.env.example` (`VITE_GOOGLE_CLIENT_ID=`), `docs/setup-guide.md` (part 3: enable Sheets + Drive APIs, OAuth consent screen in Testing with both e-mails as test users, Web client ID with the Vercel domain and `http://localhost:5173` as JavaScript origins)
- Test: `src/domain/sheetExport.test.ts`

**Interfaces:**
- Consumes: `MonthlyGrid`.
- Produces:
  - `buildSheetValues(grid: MonthlyGrid, items: { dueMonth: Month; cardName: string; item: InvoiceItem }[]): { monthly: (string | number)[][]; invoices: (string | number)[][] }` — monthly header `['Item', 'JAN', …, 'DEZ', 'Total']`; rows in grid order with values in reais as numbers (paid amount for expense rows, empty string for unpaid/none), section rows "RECEITAS", "Total das receitas", "DESPESAS", "Despesas pagas", "Despesas previstas", "Saldo previsto". Invoices header `['Vencimento', 'Cartão', 'Data', 'Descrição', 'Categoria', 'Parcela', 'Valor']`, parcela as `'03/10'` or empty.
  - `exportYear(year: number, values, accessToken: string, existing?: { spreadsheetId: string }): Promise<{ spreadsheetId: string; url: string }>` — create spreadsheet titled `Orçamento Thiago & Laina <year>` with sheets "Mês a mês" and "Faturas" when `existing` is absent or returns 403/404; otherwise clear both sheets and write values (`values:batchUpdate`, `valueInputOption: 'RAW'`).
  - `sheet_exports` row per `(user_id, year)` upserted after success.

- [ ] **Step 1: Write the failing test:** for the Task 11 fixture, `monthly[0]` equals the header; the "Total das receitas" row's NOV value is `26306.28` (number); PNR row has `665.94` in every month; an unpaid Condomínio month is `''`; `invoices` rows contain `['2026-12-10', 'Nubank', …, '03/10', 150]` for the tv item.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `sheetExport.ts`; run — PASS.
- [ ] **Step 4:** Implement `ExportButton`: label "Exportar para o Google Drive"; requests a token via GIS `initTokenClient({ scope: 'https://www.googleapis.com/auth/drive.file' })`; states "Exportando…", success "Planilha atualizada" + link "Abrir planilha", saved link shown next to the button on later visits; errors: popup closed → nothing; API error → "Não consegui exportar. Tente de novo."
- [ ] **Step 5:** Manual: export twice for 2026 → one spreadsheet in Drive, updated. Commit `feat: export year to google sheets`.

---

### Task 15: Deploy and hand-over

**Files:**
- Modify: `vercel.json` (SPA rewrite of non-`/api` paths to `/index.html`), `docs/setup-guide.md` (part 4), `README.md` (create: what the app is, local dev commands, link to setup guide)

- [ ] **Step 1:** Setup guide part 4 (Portuguese): import the GitHub repo in Vercel; env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`; add the Vercel URL to Supabase Auth "Site URL" and to the Google OAuth origins; first login checklist (Laina confirms her payslip values; set the person on PNR, Taya, Clube; register cards; import one invoice).
- [ ] **Step 2:** Run `npm test && npm run lint && npm run build && supabase test db` — Expected: all pass.
- [ ] **Step 3:** Smoke checklist on the deployed URL with both accounts: Thiago marks Condomínio paid → Laina sees ✓ after reload; import a real PDF; export to Drive.
- [ ] **Step 4:** Commit `docs: deploy and hand-over guide`.
