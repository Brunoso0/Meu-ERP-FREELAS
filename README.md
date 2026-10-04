# Meu ERP Freelas

Um ERP para o freelancer que trabalha sozinho: clientes, propostas, demandas num kanban semanal, agenda, financeiro, metas e geradores de orçamento, proposta e contrato em PDF.

Foi feito para **uso individual**: você é quem atende os clientes e faz o trabalho. Uma pessoa, uma conta, os próprios dados. Você pode testar em dois minutos sem configurar nada, e depois ligar ao seu próprio banco para usar de verdade.

## Sumário

- [Testar agora (modo demo)](#testar-agora-modo-demo)
- [O que tem dentro](#o-que-tem-dentro)
- [Usar de verdade com Supabase](#usar-de-verdade-com-supabase)
- [Deixar com a sua cara](#deixar-com-a-sua-cara)
- [Publicar na internet](#publicar-na-internet)
- [Como usar no dia a dia](#como-usar-no-dia-a-dia)
- [Segurança](#segurança)
- [Para quem vai mexer no código](#para-quem-vai-mexer-no-código)
- [Problemas comuns](#problemas-comuns)

## Testar agora (modo demo)

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

Sem configuração nenhuma, o app abre em **modo demo**: já vem com clientes, demandas e lançamentos de exemplo, não pede login e salva tudo só no seu navegador. Serve para conhecer as telas, não para guardar dados de verdade.

Para zerar os dados de exemplo, apague a chave `meu-erp-freelas:demo-db:v1` no armazenamento local do navegador (DevTools → Application → Local Storage).

## O que tem dentro

| Tela | Para que serve |
|---|---|
| **Dashboard** | Faturamento do mês, demandas ativas, propostas em aberto, fluxo de caixa e o que vence em 48 horas. |
| **Clientes** | Cadastro com busca e filtro. O LTV (quanto cada cliente já pagou) é calculado sozinho. |
| **Propostas** | Lista com status e a proposta em páginas A4 (capa, escopo, cronograma, investimento), pronta para "Salvar em PDF / Imprimir". |
| **Projetos** | Agrupa as demandas, os recebimentos e as despesas de um trabalho para um cliente. |
| **Demandas** | Tabela ou kanban semanal (Backlog, Segunda a Sexta). Arraste os cards entre os dias. |
| **Agenda** | Mês ou semana, com reuniões, prazos e as demandas agendadas. |
| **Financeiro** | O que você tem a receber e as suas despesas, por mês, trimestre, ano ou tudo, com gráficos de entradas e saídas por mês e de recebido por cliente. Dá para anexar comprovante a cada lançamento. |
| **Metas & Relatórios** | Metas com progresso automático e a margem líquida de cada projeto. |
| **Calculadora de Preço** | Soma as suas horas, ferramentas, impostos e margem e diz quanto cobrar. Vira proposta com um clique. |
| **Gerador de Orçamentos** | Orçamento rápido em folha A4, no mesmo visual da proposta, com QR Code Pix para pagamento. Sai em PDF por "Salvar em PDF / Imprimir". |
| **Gerador de Propostas** | Escopo, entregáveis, cronograma, preços e condições, com numeração automática. |
| **Gerador de Contratos** | Biblioteca de cláusulas que você liga e desliga, a partir de uma proposta. |

Em qualquer tela: **Ctrl+K** abre a busca global, o botão **+ Novo** cria proposta, demanda, cliente ou transação, e o ícone de lua/sol alterna entre tema claro e escuro.

## Usar de verdade com Supabase

O [Supabase](https://supabase.com) é o banco de dados e o login do app. O plano gratuito é suficiente.

### 1. Crie o projeto

Em supabase.com, crie uma conta e um projeto novo. Guarde a senha do banco que ele pedir.

### 2. Crie as tabelas

No painel do projeto, abra **SQL Editor** e rode os arquivos da pasta [`supabase/migrations/`](supabase/migrations/), **nesta ordem**, colando o conteúdo de cada um e clicando em Run:

1. `001_initial_schema.sql` cria as tabelas, as regras de acesso e o espaço para comprovantes.
2. `002_quotes.sql` cria a tabela de orçamentos.
3. `003_hardening.sql` fecha o acesso para quem não está logado.
4. `004_profile_pix.sql` adiciona a chave e o QR Code Pix ao perfil.

O editor vai avisar que a consulta tem "operações destrutivas". Num projeto novo pode confirmar: os scripts só removem versões anteriores dos próprios objetos que criam.

### 3. Crie o seu usuário

O app **não tem tela de cadastro**, de propósito. A conta é criada no painel:

1. **Authentication → Users → Add user → Create new user**.
2. Informe seu e-mail e uma senha forte e marque **Auto Confirm User**.

Depois, em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up** e salve. Assim ninguém além de você consegue criar conta, nem pela API.

### 4. Aponte o app para o projeto

Em **Project Settings → API Keys**, copie a URL do projeto e a chave **publishable** (ou a `anon`, nos projetos antigos).

Copie o arquivo `.env.example` para `.env.local` e preencha:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publishable
```

> Use somente a chave publishable/anon. A chave `service_role` (ou `secret`) dá acesso total ao banco e nunca deve ir para este arquivo nem para o site.

### 5. Entre

Reinicie o `npm run dev`. Agora o app abre na tela de login. Entre com o usuário que você criou e, antes de tudo, clique no seu nome no rodapé do menu para preencher os dados de **Minha empresa**: eles aparecem como emitente nos orçamentos, propostas e contratos, e é ali que você cadastra a chave e o QR Code Pix.

O indicador no topo da tela mostra **Supabase** em verde quando a conexão está funcionando.

## Deixar com a sua cara

- **Dados da empresa e Pix.** Menu → seu nome no rodapé → Minha empresa. Ali ficam nome, CNPJ, contatos, a **chave Pix** e a **imagem do QR Code Pix** (a que o app do seu banco gera). Os orçamentos mostram o que estiver cadastrado: QR, chave, ou os dois. O QR é uma imagem fixa: o app mostra o valor ao lado e pede que o cliente o informe ao pagar.
- **Cláusulas e serviços do contrato.** Ficam em [`src/lib/contract.ts`](src/lib/contract.ts). As que vêm no projeto foram escritas para serviços de manutenção de sistemas e edição de listas de dados; ajuste a lista `serviceKinds` e os textos para a sua atividade. São um modelo-base, não uma revisão jurídica.
- **Nome e cor.** O nome aparece em `index.html` e em `src/components/layout/Sidebar.tsx`; a cor de destaque é a paleta `brand` em `tailwind.config.js`.

## Publicar na internet

O app é um site estático: qualquer hospedagem de arquivos serve. Abaixo, o caminho pelo **Cloudflare Pages**, que é gratuito e dá um endereço `seu-nome.pages.dev`.

1. Abra [`public/_headers`](public/_headers) e troque o endereço do Supabase que aparece na linha `Content-Security-Policy` (em `img-src` e `connect-src`) pelo do **seu** projeto. Se pular este passo, o site publicado bloqueia a conexão com o banco e o login não funciona.
2. Gere o site com o `.env.local` já preenchido:
   ```bash
   npm run build
   ```
3. No Cloudflare, vá em **Workers & Pages → Create → Pages → Drag and drop your files**, dê um nome ao projeto e envie a pasta `dist` (ou um zip do conteúdo dela).
4. Clique em **Deploy site**.

Para atualizar depois, rode `npm run build` de novo e, no projeto do Pages, use **Create deployment** para enviar a nova pasta `dist`.

No Supabase, em **Authentication → URL Configuration**, coloque o endereço publicado em **Site URL**, para que e-mails de redefinição de senha apontem para o lugar certo.

## Como usar no dia a dia

Um caminho típico, do primeiro contato ao dinheiro na conta:

1. **Cadastre o cliente** em Clientes (ou pelo botão + Novo).
2. **Calcule o preço** na Calculadora: suas horas por atividade, ferramentas, impostos e a margem desejada.
3. **Converta em proposta.** O botão leva os valores para o Gerador de Propostas; complete escopo, entregáveis e cronograma e salve. Para trabalhos pequenos, use o **Gerador de Orçamentos** e mande o PDF com o QR do Pix.
4. **Marque a proposta como aprovada** quando o cliente fechar e, se quiser, **gere o contrato** a partir dela, escolhendo as cláusulas.
5. **Crie o projeto** e as **demandas**. No kanban, arraste cada card para o dia em que você vai fazê-lo.
6. **Lance o financeiro:** parcelas a receber do cliente e as suas despesas (ferramentas, impostos, equipamento). Ao receber ou pagar, marque como pago e, se quiser, anexe o comprovante.
7. **Acompanhe** no Dashboard e em Metas & Relatórios quanto entrou, o que vence e qual a margem real de cada projeto.

Algumas regras que ajudam a entender os números:

- Ao marcar um projeto como **Concluído**, o recebimento do orçamento é lançado sozinho no Financeiro, já como pago. Se parte do valor já tinha sido lançada para o projeto, entra só o que falta; reabrir e concluir de novo não duplica.
- Uma transação pendente com vencimento no passado aparece como **Atrasado** automaticamente.
- No Financeiro, o **saldo** é o que foi recebido menos o que foi pago dentro do período escolhido (pela data do pagamento); os demais cartões consideram o que vence dentro dele. Em "Tudo", o saldo é o acumulado geral.
- A **margem do projeto** é o valor cobrado nas demandas menos as despesas que você lançou no financeiro ligadas àquele projeto.
- O progresso das **metas** é medido pelo sistema (recebimentos pagos, clientes ou projetos criados no período) somado ao valor manual que você informar.
- Todas as listas mostram **10 itens por página**.

## Segurança

O que já vem configurado:

- Cada linha do banco pertence a um usuário, e as regras de acesso (RLS) garantem que só ele a lê ou altera.
- Quem não está logado não lê nem escreve nada pela API.
- Comprovantes ficam num espaço privado, limitados a 5 MB e a imagem ou PDF.
- O site publicado envia cabeçalhos que bloqueiam scripts de terceiros, conexões com outros servidores e a exibição dentro de outras páginas.

O que depende de você:

- Usar uma **senha forte e exclusiva** no login do app.
- Ligar a **verificação em duas etapas** nas contas do Supabase e da hospedagem: quem entra nelas tem acesso a tudo.
- Fazer **backup** dos dados de tempos em tempos (no plano gratuito do Supabase isso não é automático).
- Nunca publicar a chave `service_role`/`secret` nem o arquivo `.env.local`.

## Para quem vai mexer no código

React 18, TypeScript, Vite, Tailwind, Radix UI, TanStack Query, Zustand, React Hook Form com Zod, Recharts, @hello-pangea/dnd, Supabase e jsPDF.

```bash
npm run dev         # servidor de desenvolvimento
npm run typecheck   # checagem de tipos
npm run build       # checagem de tipos + build de produção em dist/
npm run preview     # serve o build localmente
```

```
src/
  types/database.types.ts   tipos de todas as tabelas
  lib/
    supabase.ts             cliente Supabase (nulo em modo demo)
    db.ts                   repositório único: Supabase ou banco demo
    mock-data.ts            dados de exemplo do modo demo
    pdf.ts                  PDFs de orçamento, proposta e contrato
    proposal.ts contract.ts montagem dos documentos
  hooks/useData.ts          useTable / useInsert / useUpdate (otimista) / useRemove
  store/ui.ts               tema, menu, formulário aberto, busca global
  components/
    ui/                     botões, campos, tabela, paginação, drawer, dropdown
    forms/                  EntityForm (formulário por configuração) + GlobalModals
    layout/                 Sidebar, TopBar, CommandPalette
  pages/                    uma tela por módulo; tools/ para as ferramentas
supabase/migrations/        scripts SQL do banco, em ordem
public/_headers             cabeçalhos de segurança da hospedagem
```

As telas nunca falam direto com o Supabase: tudo passa por `src/lib/db.ts`, que decide entre o banco real e o demo. É por isso que o app inteiro funciona sem configuração.

Para **adicionar um campo** a um cadastro: crie a coluna numa nova migração, adicione a propriedade em `database.types.ts` e inclua o campo em `fields` e `schemas` de `src/components/forms/GlobalModals.tsx`.

## Problemas comuns

**O app abriu sem pedir login e com dados de exemplo.**
Está em modo demo: o `.env.local` não existe, está vazio ou o servidor não foi reiniciado depois de criá-lo.

**"Invalid login credentials".**
E-mail ou senha errados, ou o usuário não foi criado/confirmado em Authentication → Users.

**Entrei, mas nada salva ("permission denied" ou "row-level security").**
Alguma migração não foi executada, ou foi fora de ordem. Rode todas novamente, na ordem.

**Funciona no meu computador, mas no site publicado o login não responde.**
O endereço do Supabase em `public/_headers` ainda é o de outro projeto. Corrija, gere o build e publique de novo.

**Ao salvar um orçamento: "relation quotes does not exist".**
Faltou rodar `002_quotes.sql`.

**O bloco do Pix não aparece no orçamento.**
Falta cadastrar a chave Pix ou a imagem do QR Code em Minha empresa (clique no seu nome, no rodapé do menu).

**O indicador no topo mostra "Offline".**
O app não conseguiu falar com o Supabase: confira a URL e a chave no `.env.local` e se o projeto não foi pausado por inatividade (acontece no plano gratuito).
