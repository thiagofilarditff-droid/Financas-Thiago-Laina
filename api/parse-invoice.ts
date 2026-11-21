import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { ERROR_MESSAGES, GENERATE_TIMEOUT_MS, ParseError, parseInvoicePdf, type Generate } from './_lib/parseInvoice';

const bodySchema = z.object({
  fileBase64: z.string().min(1),
  cards: z
    .array(z.object({ id: z.string(), name: z.string(), bank: z.string(), holder: z.string() }))
    .default([]),
});

const realGenerate: Generate = async ({ pdfBase64, systemPrompt, userPrompt, responseSchema }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-flash-latest',
      contents: {
        parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }, { text: userPrompt }],
      },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: responseSchema as never,
        abortSignal: controller.signal,
      },
    });
    return response.text ?? '';
  } finally {
    clearTimeout(timer);
  }
};

function fail(res: VercelResponse, status: keyof typeof ERROR_MESSAGES) {
  return res.status(status).json({ error: ERROR_MESSAGES[status] });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return fail(res, token ? 502 : 401);
  try {
    const { data, error } = await createClient(url, anonKey).auth.getUser(token);
    if (error || !data.user) return fail(res, 401);
  } catch {
    return fail(res, 401);
  }

  const body = bodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const result = await parseInvoicePdf(body.data.fileBase64, body.data.cards, realGenerate);
    return res.status(200).json(result);
  } catch (err) {
    const status = err instanceof ParseError ? err.status : 502;
    // Only the status/error class is logged: never the PDF or its contents.
    console.error(`[parse-invoice] failed status=${status} class=${err instanceof Error ? err.name : 'unknown'}`);
    return fail(res, status);
  }
}
