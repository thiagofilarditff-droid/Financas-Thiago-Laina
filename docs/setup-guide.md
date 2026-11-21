# Guia de instalação — Orçamento da Casa

Passo a passo para colocar o app no ar, na ordem abaixo.

| Parte | O que é | Tempo aproximado |
|-------|---------|------------------|
| 1 | Supabase: banco de dados, login e dados iniciais | 20–30 min |
| 2 | Gemini: chave para a leitura automática das faturas | 5 min |
| 3 | Google Drive: exportar para Planilhas | 15 min |
| 4 | Vercel: publicar o app, ajustar os logins e primeiro acesso | 20–30 min |

## Parte 1 — Supabase (banco de dados e login)

### 1. Criar o projeto

1. Entre em <https://supabase.com> e crie uma conta (o plano gratuito basta).
2. **New project** → dê um nome (ex.: `orcamento-casa`), escolha uma senha forte
   para o banco (guarde-a) e a região **South America (São Paulo)**.
3. Espere o projeto ficar pronto (1–2 minutos).

### 2. Criar as tabelas (`supabase db push`)

No terminal, dentro da pasta do projeto:

```bash
npm install
npx supabase login                         # abre o navegador para autorizar
npx supabase link --project-ref SEU_REF    # o "ref" está em Project Settings → General
npx supabase db push                       # cria tabelas, regras de acesso e o bucket "invoices"
```

O `link` pede a senha do banco criada no passo 1.

### 3. Cadastrar os dois usuários

1. **Authentication → Users → Add user → Create new user**.
2. Informe o e-mail e a senha do Thiago e marque **Auto Confirm User**.
3. Repita para a Laina.

### 4. Desligar novos cadastros

**Authentication → Sign In / Providers** (ou *Settings*, conforme a versão do
painel) → desmarque **Allow new users to sign up** → **Save**. Assim ninguém
além de vocês dois consegue criar conta. O app não tem tela de cadastro.

### 5. Carregar os dados iniciais (`seed.sql`)

1. Abra o arquivo `supabase/seed.sql` do projeto.
2. No início dele, troque os dois `'TROCAR'` pelos e-mails cadastrados no passo 3:

   ```sql
   thiago_email text := 'thiago@exemplo.com';
   laina_email text := 'laina@exemplo.com';
   ```

3. No painel do Supabase, abra **SQL Editor → New query**, cole o arquivo inteiro
   e clique em **Run**.
4. Deve aparecer a mensagem *"Casa criada com sucesso"*. Se aparecer
   *"Usuário não encontrado"*, confira os e-mails. Rodar de novo é seguro: se a
   casa já existir, nada é alterado.

O seed cria: Thiago e Laina, as 9 categorias, os dois contracheques (a partir de
janeiro de 2026), a remuneração do Ministério da Defesa e as 11 despesas
fixas. Cartões não são criados — cadastre os seus na tela **Cartões**.

> **Atenção:** as despesas **PNR**, **Taya Advogados** e **Clube da Aeronáutica**
> são descontadas em folha, mas ainda não têm pessoa definida. Na tela
> **Despesas**, escolha de qual contracheque cada uma é descontada.

### 6. Ligar o app ao Supabase (`.env.local`)

Em **Project Settings → API** copie a **Project URL** e a chave **anon public**
e crie o arquivo `.env.local` na raiz do projeto:

```
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Esse arquivo não vai para o Git. Depois rode `npm run dev`, abra
<http://localhost:5173> e entre com seu e-mail e senha.

---

## Desenvolvimento local (opcional)

Requer Docker. O Supabase roda inteiro na sua máquina, com dois usuários de teste:

```bash
npm run db:start    # sobe banco, login, API e storage locais
npm run db:reset    # recria o banco: migrations + seed.local.sql + seed.sql
npm run db:test     # testes de segurança (RLS) em SQL
npm run test:integration   # entra como usuária local e carrega o snapshot
```

> **Nunca** use `npx supabase db push --include-seed` (nem `db reset --linked`)
> contra o projeto de produção: isso executaria os arquivos de seed locais. Em
> produção, o seed é só o `seed.sql`, colado no SQL Editor (passo 5).

Usuários locais (criados por `supabase/seed.local.sql`, que **nunca** deve ser
executado em produção e se recusa a rodar sem o marcador de
`supabase/seed.local-enable.sql`): `thiago@local.test` e `laina@local.test`, senha
`senha-local-123`. Para usar o app com o banco local, crie `.env.local` com a
URL `http://127.0.0.1:54321` e a chave `ANON_KEY` mostrada por
`npx supabase status`.

## Parte 2 — Gemini (leitura automática das faturas)

A leitura do PDF da fatura é feita pelo Gemini, numa função do Vercel. A chave
fica **só** no Vercel — nunca em variáveis `VITE_*`, que iriam para o navegador.

### 1. Criar a chave no Google AI Studio

1. Entre em <https://aistudio.google.com/apikey> com uma conta Google.
2. Clique em **Create API key** e escolha (ou crie) um projeto.
3. Copie a chave. O plano **gratuito** basta para o uso da casa; se o limite por
   minuto for atingido, o app avisa e basta tentar de novo em um minuto.

### 2. Colar a chave no Vercel

1. No painel do Vercel, abra o projeto → **Settings → Environment Variables**.
2. Adicione, para Production (e Preview, se quiser):
   - `GEMINI_API_KEY` = a chave copiada
   - `GEMINI_MODEL` = `gemini-flash-latest` (opcional; este é o padrão)
   - `SUPABASE_URL` = a *Project URL* do Supabase (a mesma do passo 6 da Parte 1)
   - `SUPABASE_ANON_KEY` = a chave *anon public* do Supabase
3. Faça um novo deploy (**Deployments → Redeploy**) para as variáveis valerem.

> O PDF da fatura pode ter no máximo 3 MB. Na importação ele é enviado ao Gemini
> só para a leitura, e nada é salvo até vocês confirmarem a tela de revisão.
> Ao clicar em **Salvar fatura**, o PDF fica guardado num bucket **privado** do
> Supabase Storage (`invoices`), que só vocês dois conseguem acessar (as regras de
> acesso liberam apenas os membros da casa, e ninguém mais tem login no app). O PDF
> é apagado quando a fatura é excluída (**Excluir fatura**) ou substituída por outra
> importação ou por um total lançado à mão.
> No plano gratuito do Gemini, o Google pode usar o conteúdo enviado para melhorar
> os produtos dele; se isso incomodar, use **Lançar total à mão**.

---

## Parte 3 — Exportar para o Google Drive (Planilhas)

O botão **Exportar para o Google Drive** (tela *Mês a mês*) cria uma planilha por
ano na conta Google de quem exporta, com as abas "Mês a mês" e "Faturas". Exportar
de novo atualiza a mesma planilha.

### 1. Ativar as APIs

1. Acesse <https://console.cloud.google.com/> e crie (ou escolha) um projeto.
2. Em **APIs e serviços → Biblioteca**, ative **Google Sheets API** e **Google Drive API**.

### 2. Tela de consentimento OAuth

1. Em **APIs e serviços → Tela de consentimento OAuth**, escolha **Externo** e preencha o nome do app.
2. Deixe o status em **Testing** (não precisa publicar).
3. Em **Usuários de teste**, adicione os e-mails Google de vocês dois.

### 3. ID do cliente (Web)

1. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, tipo **Aplicativo da Web**.
2. Em **Origens JavaScript autorizadas**, adicione o domínio do Vercel
   (ex.: `https://seu-app.vercel.app`) e `http://localhost:5173`.
3. Copie o **ID do cliente** e cadastre como `VITE_GOOGLE_CLIENT_ID` no Vercel
   (Settings → Environment Variables) e em `.env.local`. Faça um novo deploy.

> Na primeira exportação o Google avisa que o app não foi verificado: clique em
> **Avançado → Continuar**. O app só acessa arquivos criados por ele mesmo
> (escopo `drive.file`) e envia os dados apenas para o Google.

---

## Parte 4 — Publicar no Vercel e primeiro acesso

Aqui o app vai para a internet. Você vai precisar dos valores das partes
anteriores (URL e chave do Supabase, chave do Gemini, ID do cliente Google).

### 1. Importar o projeto

1. Entre em <https://vercel.com> e faça login com a sua conta do GitHub.
2. Clique em **Add New… → Project**.
3. Na lista de repositórios, encontre **thiagofilarditff-droid/Financas-Thiago-Laina**
   e clique em **Import**. (Se não aparecer, clique em *Adjust GitHub App
   Permissions* e dê acesso a esse repositório.)
4. Em **Framework Preset**, escolha **Vite**. Deixe os comandos de build como
   estão (`npm run build`, pasta `dist`).
5. O Vercel publica a **branch principal (main)**. Confirme que o trabalho já
   foi incorporado a ela antes de importar.

### 2. Variáveis de ambiente

Ainda na tela de importação, abra **Environment Variables** e cadastre as 7
variáveis abaixo (nome exatamente como escrito, sem aspas):

| Nome | De onde vem o valor |
|------|---------------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → **Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → chave **anon public** |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud → Credenciais → **ID do cliente** (Parte 3) |
| `SUPABASE_URL` | O mesmo valor de `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | O mesmo valor de `VITE_SUPABASE_ANON_KEY` |
| `GEMINI_API_KEY` | Google AI Studio → a chave criada na Parte 2 |
| `GEMINI_MODEL` | `gemini-flash-latest` |

Nunca use a chave **service_role** do Supabase aqui. Clique em **Deploy** e
espere terminar (1–3 minutos). O Vercel mostra o endereço do app, algo como
`https://financas-thiago-laina.vercel.app`. Copie-o.

> Se esquecer alguma variável, adicione em **Settings → Environment Variables**
> e depois faça **Deployments → ⋯ → Redeploy**.

### 3. Liberar o endereço do Vercel no Supabase

1. No Supabase, abra **Authentication → URL Configuration**.
2. Em **Site URL**, cole o endereço do Vercel (ex.: `https://financas-thiago-laina.vercel.app`).
3. Em **Redirect URLs**, clique em **Add URL** e adicione o mesmo endereço, e
   também `http://localhost:5173` (para usar no seu computador).
4. **Save**.

### 4. Liberar o endereço no Google (exportar para o Drive)

1. Em <https://console.cloud.google.com/>, vá em **APIs e serviços → Credenciais**
   e abra o **ID do cliente OAuth** criado na Parte 3.
2. Em **Origens JavaScript autorizadas**, confirme que o endereço do Vercel está
   na lista (sem barra no final). Se não estiver, **Adicionar URI** e cole.
3. **Salvar**. Pode levar alguns minutos para valer.

### 5. Primeiro acesso — lista de conferência

Abra o endereço do Vercel e entre com o e-mail e a senha de cada um.

- [ ] **Laina confirma os valores do contracheque** dela (tela de renda): salário
  líquido e descontos conferem com o contracheque real? Corrija se preciso.
- [ ] Na tela **Despesas**, defina a **pessoa** (de qual contracheque é
  descontado) em **PNR**, **Taya Advogados** e **Clube da Aeronáutica**.
- [ ] Na tela **Cartões**, cadastre os cartões (apelido e os 4 últimos dígitos —
  nunca o número inteiro).
- [ ] **Importe uma fatura** em PDF (até 3 MB), confira a tela de revisão e só
  então confirme. Nada é salvo antes disso.
- [ ] Em **Mês a mês**, clique em **Exportar para o Google Drive** uma vez e
  confira a planilha criada. No aviso de app não verificado: **Avançado → Continuar**.
- [ ] Teste a ligação entre vocês: Thiago marca **Condomínio** como pago e Laina,
  depois de recarregar a página, vê o ✓.

### Se algo der errado

- **Erro 429 ou “limite” ao importar a fatura:** o plano gratuito do Gemini
  tem limite por minuto. Espere um minuto e tente de novo.
- **PDF maior que 3 MB:** o app não consegue ler. Lance o **total da fatura à
  mão** (ou gere um PDF menor pelo site do banco).
- **Erro ao entrar (login) ou volta para a tela de login:** confira o **Site URL**
  e as **Redirect URLs** no Supabase (passo 3), sem erro de digitação nem barra
  no final.
- **Exportar para o Drive dá erro de origem:** confira o passo 4 e se o seu
  e-mail está em **Usuários de teste** (Parte 3).
- **A leitura da fatura não funciona depois de publicar:** confira as variáveis
  do passo 2 e faça um **Redeploy**.
