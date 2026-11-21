# Guia de instalação — Orçamento da Casa

Passo a passo para colocar o app no ar. Este documento cresce a cada parte do
projeto; por enquanto cobre o **banco de dados (Supabase)**.

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

> O PDF da fatura pode ter no máximo 4 MB. Os PDFs não são guardados: são
> enviados ao Gemini só para a leitura e nada fica salvo até você confirmar a
> tela de revisão.
