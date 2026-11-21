import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 50mb limit for PDF and image base64 uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Credit Card Invoice Analysis with Gemini
  app.post('/api/cards/parse-invoice', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY não configurada no servidor. Configure a chave nas configurações do AI Studio.',
        });
      }

      const { fileBase64, mimeType, fileName, targetCard, allCards, targetMonth } = req.body;

      if (!fileBase64 || !mimeType) {
        return res.status(400).json({
          error: 'Arquivo não fornecido ou formato inválido.',
        });
      }

      // Remove data URL prefix if present (e.g. data:image/png;base64,)
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const cardContext = targetCard
        ? `
CARTÃO ALVO SELECIONADO PELO USUÁRIO NO SISTEMA:
- Nome do cartão: ${targetCard.name || 'Não informado'}
- Banco emissor: ${targetCard.bank || 'Não informado'}
- Titular: ${targetCard.holder || 'Não informado'}
- Bandeira: ${targetCard.brand || 'Não informado'}
- Dia de vencimento: Dia ${targetCard.dueDay || 'Não informado'}
- Dia de fechamento: Dia ${targetCard.closingDay || 'Não informado'}
(IMPORTANTE: A conferência deve ser feita APENAS pelo Banco emissor e Titular. NÃO confira números de cartão.)
`
        : 'Nenhum cartão alvo especificado previamente.';

      const otherCardsContext =
        allCards && allCards.length > 0
          ? `
LISTA DE TODOS OS CARTÕES CADASTRADOS NO SISTEMA:
${JSON.stringify(
  allCards.map((c: any) => ({
    id: c.id,
    name: c.name,
    bank: c.bank,
    holder: c.holder,
  })),
  null,
  2
)}
`
          : '';

      const targetMonthContext =
        targetMonth !== undefined && targetMonth !== null
          ? `Mês selecionado atualmente pelo usuário no sistema: Índice ${targetMonth} (onde 0=Jan, 1=Fev, 2=Mar, 3=Abr, 4=Mai, 5=Jun, 6=Jul, 7=Ago, 8=Set, 9=Out, 10=Nov, 11=Dez).`
          : '';

      const systemPrompt = `Você é um assistente financeiro especialista em leitura e conciliação de faturas de cartões de crédito brasileiros (Itaú, Nubank, Banco do Brasil, Bradesco, C6 Bank, XP, Inter, Caixa, Santander, etc.).
Sua tarefa é analisar rigorosamente o documento anexo (PDF ou imagem da fatura de cartão de crédito) e extrair:
1. CONFERÊNCIA DO CARTÃO (REGRA MANDATÓRIA: NÃO COMPARAR NÚMERO OU DÍGITOS DO CARTÃO):
   - Identifique o banco emissor e o titular da fatura.
   - NÃO compare, NÃO valide e NÃO exija coincidência entre o número do cartão (ou 4 últimos dígitos) da fatura e o cartão cadastrado. Faturas contêm frequentemente números de cartões virtuais, compras digitais ou cartões adicionais que diferem do cartão principal.
   - Para verificar se a fatura corresponde ao cartão alvo ('isCorrectCard'), CONFIRA ESTRITAMENTE:
     * 1) Se a fatura é do mesmo BANCO ou instituição financeira do cartão (ex: Itaú, Nubank, Banco do Brasil, etc.).
     * 2) Se o TITULAR da fatura corresponde ao titular do cartão cadastrado (compatibilidade de nome).
   - Se o banco e o titular conferirem, marque 'isCorrectCard' como true!
   - Marque 'isCorrectCard' como false APENAS se o banco for diferente (ex: fatura Bradesco vs cartão Itaú) ou se o titular for claramente outra pessoa (ex: Thiago vs Laina).
   - Se o banco ou titular for diferente e pertencer a outro cartão da lista de cartões cadastrados, indique o ID correspondente em "suggestedCardId".
2. INFORMAÇÕES DA FATURA E PAGAMENTO ANTECIPADO / ADIANTAMENTO:
   - Data de vencimento e data de fechamento.
   - Mês de referência (invoiceMonthIndex de 0 a 11, sendo 0=Janeiro, 1=Fevereiro, ..., 8=Setembro, 9=Outubro, 10=Novembro, 11=Dezembro):
     * REGRA BRASILEIRA MANDATÓRIA: A fatura é fechada e computada no mês de referência M e é paga no mês M+1.
     * Se o documento indicar vencimento em OUTUBRO (ex: 10 de Outubro), o mês de referência (invoiceMonthIndex) é SETEMBRO (índice 8).
     * Se o documento indicar vencimento em NOVEMBRO, o mês de referência é OUTUBRO (índice 9).
     * Se houver targetMonth informado no prompt pelo usuário, utilize preferencialmente esse mês de referência (0 a 11).
   - Valor total líquido a pagar indicado na fatura (totalAmount em R$). Exemplo: saldo total da fatura a pagar (ex: "Total da fatura", "Valor a pagar", "Total a pagar"). Em faturas Nubank, este valor é o total consolidado da fatura (por exemplo R$ 1.541,37) e NÃO apenas a soma de despesas parciais daquele mês (como 949.71). Garanta que totalAmount reflita com exatidão o valor integral cobrado na fatura.
   - Se houver pagamento antecipado, crédito de pagamento ou valor pago como adiantamento nesta fatura abatendo o saldo das compras, registre esse montante positivo em "detectedAdvancePayment".
   - Se consta como paga ou em aberto (isInvoicePaid).
3. LANÇAMENTOS E TRANSAÇÕES DETALHADAS:
   - Extraia cada compra/gasto individual listado na fatura.
   - Categorize cada transação em uma das seguintes categorias padrão:
     'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer', 'Streamings', 'Telefonia', 'Outras'.
   - Registre o valor da compra cobrado nesta fatura específica. Não inclua estornos como compras positivas; se for estorno/crédito, valor negativo.
   - Evite duplicar o total da fatura como se fosse uma compra individual. Exclua pagamentos de fatura anterior efetuados.
4. RECONHECIMENTO RIGOROSO DE DESPESAS PARCELADAS:
   - Geralmente nas faturas brasileiras, compras parceladas trazem o padrão XX/XX (ex: "03/10", "01/06", "12/12", "PARC 02/05", "3/10", "PARC 03 DE 10"), onde a primeira parte indica o número da parcela cobrada nesta fatura (currentInstallment) e a segunda parte indica a quantidade total de parcelas (totalInstallments). Exemplo: "03/10" significa que está sendo paga a 3ª parcela de um total de 10 parcelas.
   - SEMPRE que identificar uma compra parcelada:
     * installmentInfo: informe a string no padrão "03/10" (com 2 dígitos, ex: "01/06", "03/10").
     * currentInstallment: número inteiro da parcela do mês atual (ex: 3).
     * totalInstallments: número inteiro total de parcelas da compra (ex: 10).
     * description: limpe o nome do estabelecimento retirando o sufixo numérico da parcela (ex: para "MAGAZINE LUIZA 03/10", use description "MAGAZINE LUIZA" e installmentInfo "03/10"). Isso é indispensável para conciliação automática com os próximos meses sem gerar duplicidade.`;

      const promptText = `Analise a fatura de cartão de crédito em anexo (${fileName || 'documento'}).
${cardContext}
${otherCardsContext}
${targetMonthContext}

Realize a conferência do cartão conferindo APENAS banco e titular (sem comparar número de cartão) e extraia todas as despesas individuais detalhadas e valor a pagar da fatura.`;

      const invoiceResponseSchema = {
        type: Type.OBJECT,
        properties: {
          detectedBank: {
            type: Type.STRING,
            description: 'Nome do banco ou instituição emissora da fatura',
          },
          detectedHolder: {
            type: Type.STRING,
            description: 'Nome do titular constante na fatura ou não identificado',
          },
          detectedCardBrand: {
            type: Type.STRING,
            description: 'Bandeira do cartão (Mastercard, Visa, Elo, etc.)',
          },
          detectedCardName: {
            type: Type.STRING,
            description: 'Nome comercial identificado do cartão',
          },
          isCorrectCard: {
            type: Type.BOOLEAN,
            description: 'True se a fatura confere com o cartão alvo (mesmo banco e mesmo titular, ignorando número do cartão)',
          },
          validationMessage: {
            type: Type.STRING,
            description: 'Mensagem explicativa sobre a conferência de banco e titular do cartão',
          },
          suggestedCardId: {
            type: Type.STRING,
            description:
              'ID do cartão na lista cadastrada que melhor corresponde a esta fatura, caso não seja o selecionado',
          },
          invoiceDueDate: {
            type: Type.STRING,
            description: 'Data de vencimento da fatura (formato DD/MM/YYYY ou YYYY-MM-DD)',
          },
          invoiceClosingDate: {
            type: Type.STRING,
            description: 'Data de fechamento da fatura',
          },
          invoiceMonthIndex: {
            type: Type.INTEGER,
            description: 'Mês de referência da fatura como índice 0-11 (0=Jan, 11=Dez)',
          },
          totalAmount: {
            type: Type.NUMBER,
            description: 'Valor total em R$ da fatura a pagar (saldo indicado na fatura)',
          },
          detectedAdvancePayment: {
            type: Type.NUMBER,
            description: 'Valor em R$ pago como adiantamento ou pagamento antecipado da fatura, se houver',
          },
          isInvoicePaid: {
            type: Type.BOOLEAN,
            description: 'True se na fatura constar que foi paga/quitada',
          },
          transactions: {
            type: Type.ARRAY,
            description: 'Lista de despesas e lançamentos da fatura',
            items: {
              type: Type.OBJECT,
              properties: {
                date: {
                  type: Type.STRING,
                  description: 'Data da transação (ex: DD/MM ou DD/MM/YYYY)',
                },
                description: {
                  type: Type.STRING,
                  description: 'Nome do estabelecimento ou descrição do lançamento',
                },
                amount: {
                  type: Type.NUMBER,
                  description: 'Valor cobrado nesta fatura em R$',
                },
                category: {
                  type: Type.STRING,
                  description:
                    'Categoria: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Streamings, Telefonia, Outras',
                },
                installmentInfo: {
                  type: Type.STRING,
                  description: 'Ex: 02/10 se parcelado, ou vazio',
                },
                totalInstallments: {
                  type: Type.INTEGER,
                  description: 'Total de parcelas',
                },
                currentInstallment: {
                  type: Type.INTEGER,
                  description: 'Parcela atual',
                },
                cardholder: {
                  type: Type.STRING,
                  description: 'Nome do portador se especificado no lançamento',
                },
              },
              required: ['date', 'description', 'amount', 'category'],
            },
          },
        },
        required: [
          'detectedBank',
          'isCorrectCard',
          'validationMessage',
          'invoiceMonthIndex',
          'totalAmount',
          'transactions',
        ],
      };

      // Modelos candidatos rápidos, priorizando os de menor latência e disponibilidade imediata
      const candidateModels = [
        'gemini-flash-lite-latest',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
      ];
      let lastError: any = null;
      let responseText: string | null = null;

      for (const modelName of candidateModels) {
        const controller = new AbortController();
        // Timeout de 22 segundos por modelo para permitir extração completa de faturas sem ser abortado precocemente
        const timeoutId = setTimeout(() => controller.abort(), 22000);

        try {
          console.log(`[Gemini Invoice] Analisando fatura com modelo ${modelName}...`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: invoiceResponseSchema,
              abortSignal: controller.signal,
            },
          });
          clearTimeout(timeoutId);

          if (response.text) {
            responseText = response.text;
            console.log(`[Gemini Invoice] Sucesso com o modelo ${modelName}!`);
            break;
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastError = err;
          const errMsg = err?.message || String(err);
          console.warn(`[Gemini Invoice] Falha no modelo ${modelName}:`, errMsg);
        }
      }

      if (!responseText) {
        const rawErrStr =
          typeof lastError?.message === 'string'
            ? lastError.message
            : JSON.stringify(lastError || {});

        let friendlyError =
          'Não foi possível processar a fatura com o serviço de IA.';

        if (
          rawErrStr.includes('503') ||
          rawErrStr.includes('high demand') ||
          rawErrStr.includes('UNAVAILABLE')
        ) {
          friendlyError =
            'Os servidores da IA do Google estão enfrentando uma alta demanda momentânea (Erro 503). O sistema tentou modelos alternativos automaticamente. Por favor, clique em "Tentar Novamente" em alguns instantes.';
        } else if (rawErrStr.includes('RESOURCE_EXHAUSTED') || rawErrStr.includes('429')) {
          friendlyError =
            'Limite de requisições por minuto atingido (Erro 429). Por favor, aguarde alguns segundos e clique em "Tentar Novamente".';
        } else if (rawErrStr.includes('API_KEY') || rawErrStr.includes('apiKey')) {
          friendlyError =
            'Chave de API do Gemini não configurada ou inválida. Configure a GEMINI_API_KEY no menu de configurações do AI Studio.';
        } else if (lastError?.message) {
          friendlyError = lastError.message;
        }

        return res.status(503).json({ error: friendlyError });
      }

      // Tratar com robustez caso a resposta contenha marcação de markdown (```json ... ```)
      let cleanedJsonText = responseText.trim();
      if (cleanedJsonText.startsWith('```')) {
        cleanedJsonText = cleanedJsonText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(cleanedJsonText);
      } catch (parseErr: any) {
        const firstBrace = cleanedJsonText.indexOf('{');
        const lastBrace = cleanedJsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          parsedData = JSON.parse(cleanedJsonText.substring(firstBrace, lastBrace + 1));
        } else {
          console.error('Falha ao interpretar JSON retornado pelo Gemini:', parseErr, responseText);
          throw new Error('Formato de dados da fatura retornado pela IA é inválido.');
        }
      }

      return res.json(parsedData);
    } catch (error: any) {
      console.error('Erro ao analisar fatura do cartão:', error);
      const rawMsg = error?.message || 'Erro ao processar a fatura com o Gemini.';
      let userFriendly = rawMsg;
      if (rawMsg.includes('503') || rawMsg.includes('high demand')) {
        userFriendly =
          'Os servidores da IA do Google estão com alta demanda momentânea (Erro 503). Por favor, tente novamente em alguns segundos.';
      }
      return res.status(500).json({
        error: userFriendly,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
