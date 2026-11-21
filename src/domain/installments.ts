import type { Cents, Expense, InstallmentPlan, Invoice, InvoiceItem, Month, Snapshot } from './types';
import { addMonths, compareMonth } from './month';
import { isActiveIn } from './expenses';

export type ProjectedItem = {
  planId: string; cardId: string; description: string; amountCents: Cents;
  installmentN: number; installmentTotal: number; dueMonth: Month;
};

export type ParsedItem = {
  date: string | null; description: string; amountCents: Cents; category: string;
  installmentN: number | null; installmentTotal: number | null;
};

export type PlanAction = { type: 'link'; planId: string } | { type: 'create'; firstDueMonth: Month } | null;

export type ReconciledItem = ParsedItem & { planAction: PlanAction; expenseId: string | null };

export function normalizeDescription(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b\d{1,2}\s*(\/|DE)\s*\d{1,2}\b/g, ' ')
    .replace(/\bPARC\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function descriptionsMatch(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return inter / union >= 0.5;
}

export function installmentDueMonth(p: InstallmentPlan, n: number): Month {
  return addMonths(p.firstDueMonth, n - 1);
}

/** Installments of the card's plans that have no real invoice item yet. */
export function pendingInstallments(plans: InstallmentPlan[], items: InvoiceItem[], cardId: string): ProjectedItem[] {
  const real = new Set(items.filter((i) => i.planId !== null).map((i) => `${i.planId}#${i.installmentN}`));
  const out: ProjectedItem[] = [];
  for (const p of plans) {
    if (p.cardId !== cardId) continue;
    for (let n = 1; n <= p.totalInstallments; n++) {
      if (real.has(`${p.id}#${n}`)) continue;
      out.push({
        planId: p.id, cardId: p.cardId, description: p.description, amountCents: p.installmentCents,
        installmentN: n, installmentTotal: p.totalInstallments, dueMonth: installmentDueMonth(p, n),
      });
    }
  }
  return out;
}

// `invoices` is part of the contract for callers; matching real items by planId + installmentN is sufficient.
export function projectedItemsFor(
  plans: InstallmentPlan[], items: InvoiceItem[], _invoices: Invoice[], cardId: string, dueMonth: Month,
): ProjectedItem[] {
  return pendingInstallments(plans, items, cardId).filter((p) => p.dueMonth === dueMonth);
}

export function futureInstallmentsCents(
  plans: InstallmentPlan[], items: InvoiceItem[], _invoices: Invoice[], cardId: string, after: Month,
): Cents {
  return pendingInstallments(plans, items, cardId)
    .filter((p) => compareMonth(p.dueMonth, after) > 0)
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function reconcile(
  items: ParsedItem[], plans: InstallmentPlan[], expenses: Expense[], cardId: string, dueMonth: Month,
): ReconciledItem[] {
  const linked = new Set<string>();
  const fixed = expenses.filter((e) => e.isFixed && e.paymentMethod === 'card' && e.cardId === cardId && isActiveIn(e, dueMonth));
  return items.map((it) => {
    if (it.installmentN !== null && it.installmentTotal !== null) {
      const firstDueMonth = addMonths(dueMonth, -(it.installmentN - 1));
      const plan = plans.find((p) =>
        !linked.has(p.id) && p.cardId === cardId && p.totalInstallments === it.installmentTotal &&
        Math.abs(p.installmentCents - it.amountCents) <= 1 && p.firstDueMonth === firstDueMonth &&
        descriptionsMatch(p.description, it.description));
      if (plan) {
        linked.add(plan.id);
        return { ...it, planAction: { type: 'link', planId: plan.id }, expenseId: null };
      }
      return { ...it, planAction: { type: 'create', firstDueMonth }, expenseId: null };
    }
    const exp = fixed.find((e) =>
      descriptionsMatch(e.name, it.description) && Math.abs(it.amountCents - e.defaultCents) <= 0.1 * e.defaultCents);
    return { ...it, planAction: null, expenseId: exp ? exp.id : null };
  });
}

export function cardLimitUsedCents(s: Snapshot, cardId: string, today: Month): Cents {
  const invoices = s.invoices.filter((i) => i.cardId === cardId);
  const unpaid = invoices.filter((i) => !i.paid).reduce((sum, i) => sum + i.totalCents, 0);
  const after = invoices.reduce((m, i) => (compareMonth(i.dueMonth, m) > 0 ? i.dueMonth : m), today);
  return unpaid + futureInstallmentsCents(s.plans, s.items, s.invoices, cardId, after);
}
