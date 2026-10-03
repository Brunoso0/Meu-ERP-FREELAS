# Meu ERP Freelas

ERP para quem gerencia projetos com freelancers: clientes, propostas, demandas (kanban semanal), agenda, financeiro, metas, calculadora de orçamento e geradores de proposta e contrato.

React 18 + TypeScript + Vite · Tailwind · Radix UI · TanStack Query · Zustand · React Hook Form + Zod · Recharts · @hello-pangea/dnd · Supabase · jsPDF

## Rodar

```bash
npm install
npm run dev
```

Sem configuração nenhuma o app abre em **modo demo**: dados de exemplo salvos no `localStorage` do navegador, sem login. Para zerar os dados demo, apague a chave `meu-erp-freelas:demo-db:v1` no navegador.

## Conectar ao Supabase

1. Crie um projeto em supabase.com.
2. No SQL Editor, rode em ordem os arquivos de `supabase/migrations/` (`001_initial_schema.sql`: tabelas, RLS, numeração de propostas, profile automático e bucket `proofs`; `002_quotes.sql`: orçamentos com Pix; `003_hardening.sql`: bloqueio de acesso anônimo e demais travas de segurança). Para uso individual, desligue também "Allow new users to sign up" em Authentication.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Reinicie `npm run dev`. O app passa a exigir login (e-mail e senha) e o indicador da barra superior mostra o status da conexão.

## Estrutura

```
src/
  types/database.types.ts   tipos de todas as tabelas
  lib/
    supabase.ts             cliente Supabase (nulo em modo demo)
    db.ts                   repositório único: Supabase ou banco demo
    mock-data.ts            dados de exemplo
    pdf.ts                  PDF de propostas e contratos
    proposal.ts contract.ts montagem dos documentos
  hooks/useData.ts          useTable / useInsert / useUpdate (otimista) / useRemove
  store/ui.ts               tema, sidebar, modal aberto, command palette
  components/
    ui/                     botões, campos, tabela, drawer, dropdown, tooltip
    forms/                  EntityForm (formulário por configuração) + GlobalModals
    layout/                 Sidebar, TopBar, CommandPalette
  pages/                    uma tela por módulo; tools/ para as ferramentas
```

Para adicionar um campo a um cadastro: coluna na migração, propriedade em `database.types.ts` e uma entrada em `fields` + `schemas` de `components/forms/GlobalModals.tsx`.

## Diferenças em relação ao briefing

- `tasks` ganhou `user_id` (RLS direto, sem join) e `due_date` (prazo do card; `scheduled_date` é o dia no kanban). `project_id` é opcional.
- `proposals` ganhou `content jsonb` para os blocos do gerador (entregáveis, cronograma, itens de preço).
- `financial_transactions` ganhou `description`.
- Telas de **Projetos** e **Freelancers** foram incluídas porque os outros módulos dependem desses cadastros.
- O status "atrasado" das transações é calculado na tela (pendente com vencimento passado), não gravado.
