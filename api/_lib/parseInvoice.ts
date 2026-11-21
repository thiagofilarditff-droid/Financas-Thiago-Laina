import { z } from 'zod';
import { toCents } from '../../src/domain/money';
import type { Cents } from '../../src/domain/types';
import type { ParsedItem } from '../../src/domain/installments';
import { buildUserPrompt, CATEGORIES, RESPONSE_SCHEMA, SYSTEM_PROMPT, type CardRef } from './prompt';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const GENERATE_TIMEOUT_MS = 50_000;

export const ERROR_MESSAGES = {
  401: 'Sessão expirada. Entre novamente.',
  413: 'O PDF passa de 3 MB. Tente exportar a fatura de novo pelo app do banco.',
  429: 'O limite gratuito da IA foi atingido. Aguarde um minuto e tente de novo.',
  502: 'Não consegui ler esta fatura. Tente de novo ou lance o total à mão.',
  504: 'Não consegui ler esta fatura. Tente de novo ou lance o total à mão.',
} as const;
export type ErrorStatus = keyof typeof ERROR_MESSAGES;

export class ParseError extends Error {
  constructor(public readonly status: ErrorStatus) {
    super(ERROR_MESSAGES[status]);
    this.name = 'ParseError';
  }
}

export type ParsedInvoice = {
  detectedBank: string;
  detectedHolder: string | null;
  suggestedCardId: string | null;
  dueDate: string;
  totalCents: Cents;
  advancePaymentCents: Cents;
  items: ParsedItem[];
};

export type GenerateRequest = {
  pdfBase64: string;
  systemPrompt: string;
  userPrompt: string;
  responseSchema: unknown;
};
export type Generate = (req: GenerateRequest) => Promise<string>;

const modelSchema = z.object({
  detectedBank: z.string(),
  detectedHolder: z.string().nullish(),
  suggestedCardId: z.string().nullish(),
  invoiceDueDate: z.string(),
  totalAmount: z.number().finite(),
  detectedAdvancePayment: z.number().finite().nullish(),
  transactions: z.array(
    z.object({
      date: z.string().nullish(),
      description: z.string(),
      amount: z.number().finite(),
      category: z.string().nullish(),
      installmentInfo: z.string().nullish(),
    }),
  ),
});

function decodedSize(b64: string): number {
  const len = b64.length;
  let pad = 0;
  if (b64.endsWith('==')) pad = 2;
  else if (b64.endsWith('=')) pad = 1;
  return Math.floor((len * 3) / 4) - pad;
}

function stripDataPrefix(s: string): string {
  return s.replace(/\s+/g, '').replace(/^data:[^;,]*;base64,/i, '');
}

export function parseInstallment(info: string | null | undefined): { n: number | null; total: number | null } {
  const m = /\b(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i.exec(info ?? '');
  if (!m) return { n: null, total: null };
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (n < 1 || total < 1 || n > total) return { n: null, total: null };
  return { n, total };
}

const validYmd = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO and DD/MM/YY(YY) dates are taken as written. For a bare DD/MM the year is
 * inferred from the due date: the date must not be after it, and with
 * installment n the purchase is about n-1 months before the due month, so the
 * year closest to that month wins.
 */
export function normalizeDate(raw: string, due?: string, installmentN?: number | null): string | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return validYmd(+iso[1], +iso[2], +iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(text);
  if (!br) return null;
  const day = +br[1];
  const month = +br[2];
  if (br[3]) {
    const year = br[3].length === 2 ? 2000 + +br[3] : +br[3];
    return validYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }
  const dueMatch = due ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(due) : null;
  if (!dueMatch || !validYmd(2000, month, day)) return null;
  const dueYear = +dueMatch[1];
  const target = dueYear * 12 + (+dueMatch[2] - 1) - ((installmentN ?? 1) - 1);
  let best: { year: number; dist: number } | null = null;
  for (let year = dueYear - 3; year <= dueYear; year++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (iso > due!) continue;
    const dist = Math.abs(year * 12 + (month - 1) - target);
    if (!best || dist < best.dist || (dist === best.dist && year > best.year)) best = { year, dist };
  }
  return best ? `${best.year}-${pad(month)}-${pad(day)}` : null;
}

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown } | null;
  const s = typeof e?.status === 'number' ? e.status : typeof e?.code === 'number' ? e.code : undefined;
  return s;
}

function isQuota(err: unknown): boolean {
  if (errorStatus(err) === 429) return true;
  const msg = err instanceof Error ? err.message : typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : '';
  return msg.includes('RESOURCE_EXHAUSTED');
}

function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callWithTimeout(generate: Generate, req: GenerateRequest): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ParseError(504)), GENERATE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([generate(req), timeout]);
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(isQuota(err) ? 429 : 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function parseInvoicePdf(base64: string, cards: CardRef[], generate: Generate): Promise<ParsedInvoice> {
  const pdfBase64 = stripDataPrefix(base64);
  if (decodedSize(pdfBase64) > MAX_PDF_BYTES) throw new ParseError(413);

  const text = await callWithTimeout(generate, {
    pdfBase64,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(cards),
    responseSchema: RESPONSE_SCHEMA,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripFence(text));
  } catch {
    throw new ParseError(502);
  }
  const parsed = modelSchema.safeParse(json);
  if (!parsed.success) throw new ParseError(502);
  const d = parsed.data;

  const dueDate = normalizeDate(d.invoiceDueDate);
  if (!dueDate) throw new ParseError(502);

  const items: ParsedItem[] = d.transactions.map((t) => {
    const { n, total } = parseInstallment(t.installmentInfo);
    const category = (CATEGORIES as readonly string[]).includes(t.category ?? '') ? (t.category as string) : 'Outras';
    return {
      date: t.date ? normalizeDate(t.date, dueDate, n) : null,
      description: t.description.trim(),
      amountCents: toCents(t.amount),
      category,
      installmentN: n,
      installmentTotal: total,
    };
  });

  const suggested = d.suggestedCardId && cards.some((c) => c.id === d.suggestedCardId) ? d.suggestedCardId : null;

  return {
    detectedBank: d.detectedBank,
    detectedHolder: d.detectedHolder?.trim() ? d.detectedHolder.trim() : null,
    suggestedCardId: suggested,
    dueDate,
    totalCents: toCents(d.totalAmount),
    advancePaymentCents: toCents(d.detectedAdvancePayment ?? 0),
    items,
  };
}
