export type Month = string; // 'YYYY-MM'
export type Cents = number; // integer

export interface Person { id: string; name: string }
export interface PayslipLine { kind: 'provento' | 'desconto'; label: string; amountCents: Cents; order: number }
export interface Payslip { id: string; personId: string; validFrom: Month; lines: PayslipLine[] }
export interface Income {
  id: string; name: string; personId: string | null; grossCents: Cents | null;
  discountCents: Cents | null; discountLabel: string | null; defaultCents: Cents;
  startMonth: Month; endMonth: Month | null; overrides: Record<Month, Cents>;
}
export interface Expense {
  id: string; name: string; category: string; isFixed: boolean; defaultCents: Cents;
  dueDay: number | null; payrollDeducted: boolean; personId: string | null;
  paymentMethod: 'cash' | 'card'; cardId: string | null; startMonth: Month; endMonth: Month | null; notes: string | null;
}
export interface ExpenseEntry { expenseId: string; month: Month; amountCents: Cents; paid: boolean; paidAt: string | null }
export interface Card {
  id: string; name: string; bank: string; brand: string; last4: string | null;
  holderPersonId: string | null; limitCents: Cents; closingDay: number; dueDay: number; color: string; archived: boolean;
}
export interface Invoice {
  id: string; cardId: string; dueMonth: Month; dueDate: string; totalCents: Cents;
  paid: boolean; paidAt: string | null; pdfPath: string | null; source: 'pdf' | 'manual';
}
export interface InvoiceItem {
  id: string; invoiceId: string; date: string | null; description: string; amountCents: Cents;
  category: string; installmentN: number | null; installmentTotal: number | null; planId: string | null; expenseId: string | null;
}
export interface InstallmentPlan {
  id: string; cardId: string; description: string; installmentCents: Cents;
  totalInstallments: number; firstDueMonth: Month; purchaseDate: string | null;
}
export interface Snapshot {
  people: Person[]; payslips: Payslip[]; incomes: Income[]; expenses: Expense[];
  entries: ExpenseEntry[]; cards: Card[]; invoices: Invoice[]; items: InvoiceItem[]; plans: InstallmentPlan[]; categories: string[];
}
