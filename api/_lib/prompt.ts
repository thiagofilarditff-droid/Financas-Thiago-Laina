import { Type } from '@google/genai';

export const CATEGORIES = [
  'Moradia', 'Saúde', 'Telefonia', 'Streamings', 'Educação', 'Alimentação', 'Transporte', 'Lazer', 'Outras',
] as const;

export const SYSTEM_PROMPT = `Você é um assistente financeiro especialista em leitura e conciliação de faturas de cartões de crédito brasileiros (Itaú, Nubank, Banco do Brasil, Bradesco, C6 Bank, XP, Inter, Caixa, Santander, etc.).
Sua tarefa é analisar rigorosamente o documento anexo (PDF da fatura de cartão de crédito) e extrair:
1. IDENTIFICAÇÃO DO CARTÃO (REGRA MANDATÓRIA: NÃO COMPARAR NÚMERO OU DÍGITOS DO CARTÃO):
   - Identifique o banco emissor (detectedBank) e o titular da fatura (detectedHolder; null se não identificado).
   - NÃO compare, NÃO valide e NÃO exija coincidência entre o número do cartão (ou 4 últimos dígitos) da fatura e os cartões cadastrados. Faturas contêm frequentemente números de cartões virtuais, compras digitais ou cartões adicionais.
   - Com base APENAS no banco emissor e no titular, indique em "suggestedCardId" o ID do cartão da lista de cartões cadastrados que melhor corresponde a esta fatura. Se nenhum corresponder com segurança, deixe vazio.
2. INFORMAÇÕES DA FATURA E PAGAMENTO ANTECIPADO / ADIANTAMENTO:
   - Data de vencimento (invoiceDueDate), no formato YYYY-MM-DD.
   - Valor total líquido a pagar indicado na fatura (totalAmount em R$): "Total da fatura", "Valor a pagar", "Total a pagar". Em faturas Nubank, este valor é o total consolidado da fatura (por exemplo R$ 1.541,37) e NÃO apenas a soma de despesas parciais daquele mês (como 949.71). Garanta que totalAmount reflita com exatidão o valor integral cobrado na fatura.
   - Se houver pagamento antecipado, crédito de pagamento ou valor pago como adiantamento nesta fatura abatendo o saldo das compras, registre esse montante positivo em "detectedAdvancePayment" (0 se não houver).
3. LANÇAMENTOS E TRANSAÇÕES DETALHADAS:
   - Extraia cada compra/gasto individual listado na fatura.
   - Categorize cada transação em uma das seguintes categorias: ${CATEGORIES.map((c) => `'${c}'`).join(', ')}.
   - Registre o valor cobrado nesta fatura específica. Estornos e créditos devem ter valor NEGATIVO; nunca os registre como compras positivas.
   - Evite duplicar o total da fatura como se fosse uma compra individual. EXCLUA pagamentos de fatura anterior efetuados.
   - Datas das transações no formato YYYY-MM-DD quando possível.
4. RECONHECIMENTO RIGOROSO DE DESPESAS PARCELADAS:
   - Compras parceladas trazem o padrão XX/XX (ex: "03/10", "01/06", "12/12", "PARC 02/05", "3/10", "PARC 03 DE 10"), onde a primeira parte indica o número da parcela cobrada nesta fatura e a segunda a quantidade total de parcelas. Exemplo: "03/10" significa a 3ª parcela de um total de 10.
   - SEMPRE que identificar uma compra parcelada:
     * installmentInfo: informe a string no padrão "03/10" (com 2 dígitos, ex: "01/06", "03/10").
     * description: limpe o nome do estabelecimento retirando o sufixo numérico da parcela (ex: para "MAGAZINE LUIZA 03/10", use description "MAGAZINE LUIZA" e installmentInfo "03/10"). Isso é indispensável para conciliação automática com os próximos meses sem gerar duplicidade.
   - Para compras não parceladas, deixe installmentInfo vazio.`;

export type CardRef = { id: string; name: string; bank: string; holder: string };

export function buildUserPrompt(cards: CardRef[]): string {
  const list = cards.length
    ? `LISTA DE CARTÕES CADASTRADOS NO SISTEMA:\n${JSON.stringify(
        cards.map((c) => ({ id: c.id, name: c.name, bank: c.bank, holder: c.holder })),
        null,
        2,
      )}`
    : 'Nenhum cartão cadastrado.';
  return `Analise a fatura de cartão de crédito em anexo.
${list}

Identifique banco e titular (sem comparar número de cartão), o vencimento, o total a pagar, o pagamento antecipado e extraia todas as despesas individuais detalhadas.`;
}

export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedBank: { type: Type.STRING, description: 'Nome do banco ou instituição emissora da fatura' },
    detectedHolder: { type: Type.STRING, description: 'Nome do titular constante na fatura; vazio se não identificado' },
    suggestedCardId: {
      type: Type.STRING,
      description: 'ID do cartão da lista cadastrada que melhor corresponde (banco e titular); vazio se nenhum',
    },
    invoiceDueDate: { type: Type.STRING, description: 'Data de vencimento da fatura (YYYY-MM-DD)' },
    totalAmount: { type: Type.NUMBER, description: 'Valor total em R$ da fatura a pagar' },
    detectedAdvancePayment: {
      type: Type.NUMBER,
      description: 'Valor em R$ pago como adiantamento ou pagamento antecipado da fatura (0 se não houver)',
    },
    transactions: {
      type: Type.ARRAY,
      description: 'Lista de despesas e lançamentos da fatura',
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'Data da transação (YYYY-MM-DD)' },
          description: { type: Type.STRING, description: 'Nome do estabelecimento, sem o sufixo de parcela' },
          amount: { type: Type.NUMBER, description: 'Valor cobrado nesta fatura em R$; negativo para estornos' },
          category: { type: Type.STRING, description: `Categoria: ${CATEGORIES.join(', ')}` },
          installmentInfo: { type: Type.STRING, description: 'Ex: 02/10 se parcelado, ou vazio' },
        },
        required: ['date', 'description', 'amount', 'category'],
      },
    },
  },
  required: ['detectedBank', 'invoiceDueDate', 'totalAmount', 'transactions'],
};
