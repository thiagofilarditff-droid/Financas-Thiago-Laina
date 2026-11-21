# Orçamento da Casa

Aplicativo web de orçamento doméstico para duas pessoas (Thiago e Laina). Reúne
rendas (contracheques), despesas fixas e faturas de cartão em uma visão mês a
mês, com leitura automática de faturas em PDF por IA e exportação para o Google
Drive. Todo o texto da interface é em português do Brasil e o layout é pensado
para computador.

## Funcionalidades

- Login por e-mail e senha para os dois moradores (sem cadastro aberto).
- Rendas por contracheque e despesas fixas por categoria, com a pessoa responsável.
- Cartões (somente os 4 últimos dígitos) e faturas por mês de vencimento.
- Importação de fatura em PDF com Gemini e tela de revisão antes de salvar.
- Grade mês a mês e totais por categoria.
- Marcar despesas como pagas, visível para os dois.
- Exportação para Planilhas Google (uma planilha por ano).

## Tecnologia

Vite, React e TypeScript; Supabase (Postgres com RLS, Auth e Storage); função
serverless no Vercel (`api/parse-invoice`) chamando o Gemini; Vitest para testes.

## Desenvolvimento local

```bash
npm install
# inicie o Docker, depois:
npm run db:start          # Supabase local
npm run dev               # app em http://localhost:5173
npm test                  # testes unitários
npm run db:test           # testes de segurança (RLS) no banco
LOCAL_SUPABASE=1 npm run test:integration   # testes de integração (banco local)
```

Também disponíveis: `npm run lint`, `npm run build`, `npm run db:reset`, `npm run db:stop`.

## Documentação

- [Guia de instalação e publicação](docs/setup-guide.md) (Supabase, Gemini, Google Drive, Vercel)
- [Especificação](docs/superpowers/specs/2026-11-21-orcamento-domestico-design.md)
- [Plano de implementação](docs/superpowers/plans/2026-11-21-orcamento-domestico.md)
