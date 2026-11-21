# Orçamento Doméstico Thiago & Laina — Design

Data: 2026-11-21 · Status: rascunho para aprovação

## 1. Intenção e porquê

Thiago e Laina controlam o orçamento da casa numa planilha e começaram um app no
Google AI Studio (código em anexo na conversa, React + Express + Gemini). O app
falhou em dois pontos que motivam este projeto:

1. **Dados que somem.** Ao reabrir, os cartões cadastrados eram substituídos por
   dois cartões fixos no código (`App.tsx`, carregamento inicial força
   "Nubank Ultravioleta" e "Bradesco Principal").
2. **Dados não compartilhados.** Tudo ficava no `localStorage` de um navegador;
   a Laina não via o que o Thiago lançava.

Além disso, o modelo de dados guarda meses como índice 0–11 sem ano, o que quebra
parcelas que atravessam a virada do ano.

O objetivo é um app web, usado pelos dois no computador, com dados num banco na
nuvem, que mostre o mês da casa (receitas, despesas, o que já foi pago) e que
leia as faturas de cartão em PDF sozinho, incluindo as parceladas, para que eles
**quase não precisem lançar nada à mão** no cartão.

## 2. Objetivos

- **Contracheques:** um cartão por pessoa (Thiago, Laina) com proventos,
  descontos em folha e líquido, editável. Os descontos em folha (IR, pensão
  militar, FAMHS etc.) são dedução da receita, não despesas. O valor vale do mês
  em que foi editado em diante, até a próxima edição.
- **Receitas:** salário líquido de cada um (vindo do contracheque) + outras
  receitas (ex.: Remuneração Ministério da Defesa, bruto R$ 2.000, IR R$ 600,
  líquido R$ 1.400), com valor padrão e possibilidade de alterar um mês
  específico.
- **Despesas:** cadastro de despesas com categoria. Algumas são **fixas**
  (repetem todo mês com valor padrão). Cada ocorrência mensal tem um campo
  **"paga"** para confirmar. Despesas "descontadas em folha" ficam pagas
  automaticamente.
- **Visão mensal (planilha anual):** grade JAN–DEZ do ano selecionado; bloco de
  receitas com total; bloco de despesas linha a linha com ✓ nas pagas; contador
  de lançamentos pagos no ano; totais e saldo por mês. Referência visual: segunda
  imagem enviada pelo Thiago.
- **Cartões de crédito:** cadastro (nome, banco, bandeira, 4 últimos dígitos,
  titular, limite, dia de fechamento, dia de vencimento, cor).
- **Importação de fatura em PDF:** o usuário sobe o PDF, a IA extrai fatura
  (vencimento, total, mês) e todas as compras (data, descrição, valor,
  categoria, parcela n/N); o usuário **confere numa tela de revisão** e salva.
- **Parcelas:** compras parceladas viram um "plano de parcelamento" que projeta
  as parcelas restantes nas faturas futuras (inclusive no ano seguinte). Lançar
  uma compra parcelada à mão continua possível, mas é exceção.
- **Fatura na visão mensal:** a fatura de cada cartão aparece como uma despesa no
  **mês do vencimento**, com o mesmo ✓ de "paga", e pode ser "desmembrada" para
  ver as compras por categoria.
- **Painel (dashboard):** tela de destaque, com visual caprichado — receitas x
  despesas por mês, distribuição por categoria, evolução no ano e o que falta
  pagar no mês. Conteúdo conforme o mockup A: indicadores (receitas líquidas,
  despesas do mês, falta pagar, sobra prevista), gráfico receitas × despesas no
  ano, contas do mês com ✓, rosca por categoria, cartões com limite usado e
  parcelas futuras previstas.
- **Login:** Thiago e Laina com e-mail e senha próprios, enxergando a mesma casa.

## 3. Não-objetivos (por enquanto)

- App de celular ou layout pensado para celular (uso é no computador; não
  impedir uma versão futura, mas não otimizar para ela).
- Integração direta com banco / Open Finance.
- Investimentos, metas de economia, limites de orçamento por categoria.
- Mais de uma casa/família por instalação.
- Importar os dados salvos no navegador pelo app antigo.

## 4. Anti-objetivos (seria fracasso mesmo "funcionando")

- Qualquer dado cadastrado sumir ou ser sobrescrito sem ação do usuário.
- A IA gravar lançamentos sem o usuário ver e confirmar.
- Parcelas duplicadas: a mesma parcela contada duas vezes (uma projetada, outra
  importada) ou a mesma fatura importada duas vezes somando em dobro.
- Guardar número completo de cartão.

## 5. Restrições

- Uso pelos dois, no navegador do computador, interface em português, valores em
  R$ (formato `11.835,24`).
- Custo zero ou quase: planos gratuitos de Supabase e Vercel; custo da IA por
  fatura importada é aceitável.
- Faturas chegam em **PDF**. Bancos conhecidos pelo código antigo: **Nubank e
  Bradesco** (a confirmar com o Thiago e testar com PDFs reais).
- A chave do Gemini nunca vai para o navegador; a chamada à IA é feita no
  servidor.

## 6. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A (escolhida)** | App React novo + **Supabase** (Postgres + login) + **Vercel** (hospedagem + função de servidor para ler PDF) | Resolve persistência e compartilhamento de vez; banco relacional serve bem para totais por mês e parcelas; login pronto; grátis; abre caminho para celular depois | Duas contas novas para criar (Supabase, Vercel) |
| B | Continuar no AI Studio + Firebase | Fica no ecossistema Google | O AI Studio reescreve o código a cada pedido (origem do bug); banco de documentos é pior para agregações e cruzamento de parcelas |
| C | Google Sheets como banco | Familiar, dados visíveis na planilha | Lento e frágil com dois usuários, sem login de verdade, regras de parcela complicadas |

O Thiago escolheu **A**.

## 7. Decisões já tomadas

- Abordagem A: React + Vite + TypeScript + Tailwind no front, Supabase como banco
  e login, Vercel como hospedagem. *(Stack de front: decisão do Claude.)*
- **Visual novo**, diferente do app original, e um **painel (dashboard) caprichado**
  — pedido do Thiago. Direção visual escolhida: **A, "Claro e sereno"** (mockup em
  https://claude.ai/artifact/6P8KYE1HNiAr9v1aNAjxGZ): fundo claro levemente
  esverdeado, verde-petróleo como cor principal, fonte Manrope, menu lateral,
  bastante espaço em branco, saldo previsto do mês em destaque.
- Leitura do PDF com IA, mantendo o **Gemini** (o Thiago já tem a chave).
  *(Decisão do Claude.)*
- Cartão guarda só os 4 últimos dígitos. *(Proposta do Claude, sem objeção.)*
- Total da fatura entra como despesa no mês do vencimento. *(Proposta do Claude,
  sem objeção.)*

## 8. Design

### 8.1 Visão geral

```
Navegador (React)  ──login/dados──▶  Supabase (Postgres + Auth + Storage)
        │
        └──PDF──▶  Vercel Function /api/parse-invoice ──▶ Gemini
                         (devolve JSON; nada é gravado até o usuário confirmar)
```

O front fala direto com o Supabase usando o cliente oficial; a segurança é feita
por Row Level Security (cada linha pertence a uma `household`, e só membros dela
leem/escrevem). A função da Vercel só faz a extração do PDF.

### 8.2 Modelo de dados (todas as tabelas com `household_id`)

Meses são sempre **ano + mês** (`date` no dia 1, ex.: `2026-11-01`).

- `households`, `household_members (user_id, household_id)`.
- `people`: Thiago, Laina (titulares de receitas, contracheques e cartões).
- `payslips (person_id, valid_from)` + `payslip_lines (payslip_id, kind
  provento|desconto, label, amount, order)`. O contracheque vigente num mês é o
  de maior `valid_from` ≤ mês. Linhas livres (não campos fixos), pré-carregadas
  com os itens atuais: Soldo, Adic. Habilitação, Adic. Militar, Adic.
  Disponibilidade / IRRF, Pensão Militar, FAMHS.
- `incomes (name, person_id, gross, discount, discount_label, default_amount,
  start_month, end_month?)` + `income_overrides (income_id, month, amount)`.
- `expenses (name, category, is_fixed, default_amount, due_day?,
  payroll_deducted, start_month, end_month?, notes)` — o "molde" da despesa.
- `expense_entries (expense_id, month, amount, paid, paid_at, paid_by)` — a
  ocorrência mensal. Para despesas fixas, a ocorrência do mês é criada na
  primeira vez que o mês é aberto (ou ao marcar como paga) com o valor padrão;
  despesa avulsa tem uma única ocorrência.
- `cards (name, bank, brand, last4, holder_person_id, limit, closing_day,
  due_day, color, archived)`.
- `invoices (card_id, reference_month, due_date, total, paid, paid_at,
  pdf_path?, imported_at)` — único por `(card_id, due_date)`; reimportar a mesma
  fatura **substitui** a anterior após confirmação.
- `invoice_items (invoice_id, date, description, amount, category,
  installment_n?, installment_total?, plan_id?, source imported|manual|projected)`.
- `installment_plans (card_id, description, installment_amount,
  total_installments, first_due_month, purchase_date?)`.
- `categories` (lista editável; inicial: Moradia, Saúde, Telefonia, Streamings,
  Educação, Alimentação, Transporte, Lazer, Outras).

### 8.3 Fluxo de importação de fatura

1. Na tela Cartões, "Importar fatura (PDF)". O usuário escolhe o cartão (a IA
   sugere qual pelo banco e titular).
2. O PDF vai para `/api/parse-invoice`, que chama o Gemini com saída em JSON
   estruturado (aproveitar o prompt e o schema do `server.ts` original, que já
   tratam "03/10", estornos e pagamento antecipado).
3. **Tela de revisão**: cabeçalho (cartão, vencimento, total da fatura) e tabela
   editável (data, descrição, valor, categoria, parcela). Mostra a soma dos itens
   x total da fatura e a diferença (encargos, IOF, ajustes) como uma linha
   "Ajuste" visível.
4. Ao confirmar: grava a fatura, os itens e o PDF (bucket privado do Supabase
   Storage); cria ou liga planos de parcelamento; remove as parcelas projetadas
   que foram substituídas por parcelas reais.

**Conciliação de parcelas.** Item com parcela n/N: procura um plano do mesmo
cartão com o mesmo total de parcelas, valor igual (tolerância de R$ 0,01) e
descrição semelhante, cuja parcela esperada naquela fatura seja n. Se achar,
liga ao plano; se não, cria o plano (calculando o mês da 1ª parcela). As
parcelas futuras ainda não importadas aparecem nas faturas seguintes como
"previstas", com visual diferente.

### 8.4 Telas

- **Painel:** saldo do mês, receitas x despesas nos 12 meses, despesas por
  categoria.
- **Visão mensal (planilha):** como a imagem enviada. Receitas (salários líquidos
  + outras + total); despesas (fixas, avulsas e uma linha por cartão com o total
  da fatura que vence no mês, com opção de desmembrar por categoria). Uma célula
  mostra ✓ e o valor quando paga; quando não paga, mostra o valor previsto
  apagado e um clique marca como paga. Totais: receitas, despesas pagas, despesas
  previstas, saldo.
- **Receitas & Contracheques:** os dois cartões de contracheque como na primeira
  imagem, edição das linhas com "vale a partir de"; lista de outras receitas.
- **Despesas:** cadastro e edição, marcação de fixa, descontada em folha,
  categoria, vencimento.
- **Cartões:** lista de cartões com limite usado (soma das faturas em aberto +
  parcelas futuras), faturas por mês, importação, lançamento manual de compra
  parcelada.
- **Login:** e-mail e senha. Novos cadastros ficam desligados depois que os dois
  entrarem.

### 8.5 Dados iniciais

Pré-carregar (via script de seed) os contracheques, a receita do Ministério da
Defesa e a lista de despesas fixas do `initialData.ts` original, para o app já
abrir parecido com o que eles usam. *(Decisão do Claude.)*

## 9. Deixado para quem construir

- Organização de pastas, componentes, biblioteca de gráficos (o original usa
  Recharts), gerenciamento de estado e de consultas.
- Detalhes do prompt da IA, de modelo do Gemini e de tolerâncias de comparação de
  descrição, desde que testados com PDFs reais de Nubank e Bradesco.
- Estratégia de testes, com prioridade para: regra de mês da fatura x mês de
  pagamento, projeção e conciliação de parcelas (inclusive na virada do ano) e
  totais da visão mensal.
