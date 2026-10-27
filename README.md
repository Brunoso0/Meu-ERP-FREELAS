# Krono

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
| **Projetos e propostas** | Andam juntos: toda proposta nova cria o seu projeto (aprovar põe em andamento, recusar cancela) e todo projeto criado na tela de Projetos ganha a sua proposta. Excluir um exclui o outro, a não ser que já haja histórico (demandas, recebimentos, orçamento ou contrato). |
| **Clientes** | Cadastro com busca e filtro. O LTV (quanto cada cliente já pagou) é calculado sozinho. Clicar no cliente abre o cadastro; o ícone de olho abre a tela geral dele: números (recebido, a receber, projetos, notas), informações editáveis com "Habilitar edição", projetos com os orçamentos de cada um (entrada, saldo, situação, comprovante e nota fiscal para anexar), todos os pagamentos, notas fiscais, propostas e contratos. |
| **Propostas** | Lista com status e a proposta em páginas A4 (capa, escopo, cronograma, investimento), pronta para "Salvar em PDF / Imprimir". |
| **Projetos** | Agrupa as demandas, os recebimentos e as despesas de um trabalho para um cliente. |
| **Demandas** | Tabela ou kanban semanal (Backlog, Segunda a Sexta). Arraste os cards entre os dias. |
| **Lembretes** | Todo dia, no horário escolhido em Minha empresa → Lembretes, as demandas do dia e as atrasadas chegam por e-mail (Resend) e como notificação no celular (app instalado). Cada aparelho é ativado nele mesmo; dá para mandar um teste na hora. |
| **Sessão e biometria** | 15 minutos sem usar o app (com ele aberto ou fechado) encerram a sessão (`src/lib/session.ts`). Login com biometria (WebAuthn/passkey: digital, rosto ou bloqueio de tela do aparelho), ativado em Minha empresa → Segurança ou no aviso depois de entrar com a senha: na tela de login, tocar no campo de e-mail pede a biometria; cancelando, segue com e-mail e senha. A função `webauthn` confere a assinatura com a chave pública guardada (migração 018) e devolve um token de uso único que o app troca por sessão. |
| **Agenda** | Mês ou semana, com reuniões, prazos e as demandas agendadas. |
| **Financeiro** | O que você tem a receber e as suas despesas, por mês, trimestre, ano ou tudo, com gráficos de entradas e saídas por mês e de recebido por cliente. Dá para anexar comprovante a cada lançamento e criar lançamentos que se repetem todo mês (mensalidades), com um quadro de quanto tempo cada um ainda dura. |
| **Metas & Relatórios** | Metas com progresso automático e a margem líquida de cada projeto. |
| **Busca, filtros e ordenação** | Todo módulo tem uma barra no topo da lista: busca sem acento por várias palavras, filtros e ordenação sempre em pares (maior e menor, mais recente e mais antigo, A–Z e Z–A). As tabelas mostram 10 por página. Os filtros ficam guardados enquanto a aba do navegador estiver aberta; "Limpar" volta ao padrão. No celular, os filtros ficam atrás do botão "Filtros". Detalhe por módulo: **Clientes** (status, empresa ou pessoa, contato, situação financeira; cadastro, nome, LTV, a receber), **Propostas** (status, cliente, data de criação, com ou sem orçamento; data, valor, validade, título, cliente), **Projetos** (começa nos em aberto; status, cliente, prazo; prazo, data, orçamento, andamento, título), **Demandas** (projeto, prioridade e prazo valem no kanban e na tabela; na tabela também status e ordenação por prazo, prioridade, dia, data e valor), **Agenda** (busca e tipo), **Financeiro** (situação, categoria, cliente, origem, comprovante e nota fiscal; vencimento, valor, pagamento, descrição), **Metas** (tipo e situação; término, progresso, início, nome) e **Lucratividade** (status e resultado; margem, margem %, cobrado, custos, projeto). Na tela do cliente, os pagamentos têm busca, situação e ordenação, e as listas de projetos, notas, propostas e contratos são paginadas. |
| **Calculadora de Preço** | Soma as suas horas, ferramentas, impostos e margem e diz quanto cobrar. Vira proposta com um clique. |
| **Gerador de Orçamentos** | Orçamento rápido em folha A4, no mesmo visual da proposta, com QR Code Pix para pagamento. Sai em PDF por "Salvar em PDF / Imprimir". |
| **Gerador de Propostas** | Escopo, entregáveis, cronograma, preços e condições, com numeração automática. |
| **Busca de Leads** | Usa o Gemini para achar no Google Maps empresas por região, nicho e alvo (sem site, sem presença digital…). Salva como lead ou abre o WhatsApp com uma mensagem pronta. |
| **Gerador de Contratos** | Biblioteca de cláusulas que você liga e desliga, a partir de uma proposta. Contrato com mensalidade lança as parcelas no financeiro ao ser assinado. |

Em qualquer tela: **Ctrl+K** abre a busca global, o botão **+ Novo** cria proposta, demanda, cliente ou transação, e o ícone de lua/sol alterna entre tema claro e escuro.

## Usar de verdade com Supabase

O [Supabase](https://supabase.com) é o banco de dados e o login do app. O plano gratuito é suficiente.

### 1. Crie o projeto

Em supabase.com, crie uma conta e um projeto novo. Guarde a senha do banco que ele pedir.

### 2. Crie as tabelas

Com o [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`npx supabase`), na pasta do projeto:

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO   # o trecho antes de .supabase.co
npx supabase db push                           # aplica as migrações que faltam, em ordem
npx supabase functions deploy                  # publica as quatro Edge Functions
```

O `db push` aplica as migrações da pasta [`supabase/migrations/`](supabase/migrations/) e lembra quais já rodaram. O `functions deploy` já publica cada função com o "Verify JWT" certo (está em [`supabase/config.toml`](supabase/config.toml)). Depois do primeiro push, grave o endereço do projeto para os agendamentos (migração 019), no SQL Editor:

```sql
select public.set_project_url('https://SEU-PROJETO.supabase.co');
```

Sem o CLI, dá para colar cada arquivo no **SQL Editor**, nesta ordem, e criar as funções à mão no painel. O que cada migração faz:

1. `001_initial_schema.sql` cria as tabelas, as regras de acesso e o espaço para comprovantes.
2. `002_quotes.sql` cria a tabela de orçamentos.
3. `003_hardening.sql` fecha o acesso para quem não está logado.
4. `004_profile_pix.sql` adiciona a chave e o QR Code Pix ao perfil.
5. `005_recurrence.sql` adiciona a recorrência: parcelas mensais no financeiro e mensalidade nos contratos.
6. `006_quote_finance.sql` liga cada orçamento a um lançamento no financeiro e a proposta aprovada ao orçamento.
7. `007_invoice.sql` adiciona o campo da nota fiscal ao lançamento.
8. `008_quote_deposit.sql` permite orçamento com entrada + saldo e a situação "parcialmente pago".
9. `009_proposal_signature.sql` cria o link público de assinatura da proposta e os status "assinatura pendente" e "assinado".
10. `010_contract_signature.sql` cria o link de assinatura do contrato e guarda a sua assinatura no perfil.
11. `011_billing_gateway.sql` adiciona a forma de cobrança (Pix simples ou Asaas) e guarda a chave do gateway cifrada no Vault.
12. `012_nfse.sql` adiciona a nota fiscal de serviço (NFS-e) emitida pelo Asaas e o catálogo de serviços do MEI.
13. `013_nfse_regime.sql` guarda o regime tributário da nota (MEI, Simples Nacional ou fora dele) e as alíquotas da última nota.
14. `014_project_proposal.sql` liga projeto e proposta um para um (no máximo um projeto por proposta) e cria o par que falta nos registros antigos. Antes de rodar, ligue à mão os pares que já existem.
15. `015_quote_recurrence.sql` cria as mensalidades do Gerador de Orçamentos e o agendamento diário (pg_cron) que chama a função `billing` para gerá-las.
16. `016_reminders.sql` cria os lembretes diários das demandas (horário e canais no perfil, aparelhos inscritos nas notificações, chaves do Web Push no Vault) e o agendamento de hora em hora que chama a função `reminders`.
17. `017_api_usage.sql` cria um contador mensal de chamadas a APIs pagas. Foi feito para a Places API do Google, que acabou não sendo adotada; hoje a tabela não é usada.
18. `018_webauthn.sql` cria as tabelas do login com biometria: a chave pública de cada aparelho cadastrado e os desafios de uso único (só a função `webauthn` lê).
19. `019_project_url.sql` tira o endereço fixo dos agendamentos das migrações 015 e 016: eles passam a ler o endereço do projeto do Vault (`set_project_url`), para cada ambiente chamar as próprias funções.

#### Busca de leads (opcional)

A Busca de Leads usa o Gemini por meio de uma função do Supabase, para a chave da API nunca ir para o navegador.

1. Crie uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. No painel do Supabase, em **Edge Functions**, crie uma função chamada `find-leads` com o conteúdo de [`supabase/functions/find-leads/index.ts`](supabase/functions/find-leads/index.ts) (ou rode `supabase functions deploy find-leads`).
3. Em **Edge Functions → Secrets**, cadastre `GEMINI_API_KEY` com a sua chave. Opcional: `GEMINI_MODEL` para trocar o modelo (padrão `gemini-2.5-flash`).

A função só responde a quem está logado no app. A busca no Google Maps pelo Gemini é cobrada pelo Google conforme o plano da sua chave; se ela não estiver disponível (a cota gratuita da chave não cobre o Maps), a função busca no Google os perfis de empresa e guias locais e confere o resultado: telefone inválido sai, empresa que contradiz o alvo (por exemplo, com site próprio numa busca "sem site") é descartada, e as que não aparecem nas fontes citadas pelo Gemini vêm marcadas "confira". Depois de uma recusa por cota ou acesso, a função deixa de tentar o Maps por 6 horas. Os dados vêm de uma IA: confira o perfil da empresa antes de entrar em contato.

#### Login com biometria

1. Rode a migração `018_webauthn.sql`.
2. Em **Edge Functions**, crie uma função chamada `webauthn` com o conteúdo de [`supabase/functions/webauthn/index.ts`](supabase/functions/webauthn/index.ts) e **desligue "Verify JWT"** (o login acontece sem sessão; o cadastro confere o usuário por conta própria). Não precisa cadastrar segredo.
3. Em **Edge Functions → Secrets**, cadastre `APP_ORIGINS` com os endereços onde o app roda, separados por vírgula (por exemplo `https://meus-freelas.pages.dev,http://localhost:5173`). A biometria fica presa ao domínio em que foi cadastrada. Sem o segredo, vale a lista padrão da função.

Todos os segredos das funções estão em [`supabase/functions/.env.example`](supabase/functions/.env.example).

#### Cobrança pelo Asaas (opcional)

Com o Asaas, cada recebimento vira uma cobrança com vencimento, multa e juros, e o lançamento é baixado sozinho quando o cliente paga.

1. Rode a migração `011_billing_gateway.sql` (ela usa o Vault do Supabase para guardar a chave cifrada).
2. Em **Edge Functions**, crie uma função chamada `billing` com o conteúdo de [`supabase/functions/billing/index.ts`](supabase/functions/billing/index.ts) e **desligue "Verify JWT"** (o Asaas não manda JWT; a função confere o usuário e o token do webhook por conta própria). Não precisa cadastrar segredo.
3. No Asaas, em **Integrações → Chaves de API**, gere uma chave. No app, abra **Minha empresa → Integrações**, escolha Asaas, cole a chave e clique em Conectar. O app confere a chave e cria sozinho o webhook que avisa os pagamentos.

Para testar sem dinheiro de verdade, crie uma conta no Sandbox do Asaas e conecte com o ambiente "Sandbox (testes)". Não ative a lista de IPs permitidos em Integrações → Segurança: as funções do Supabase não têm IP fixo.

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

- **Minha empresa** (seu nome no rodapé do menu) é uma tela com quatro seções: **Dados da Empresa** (nome, CNPJ, contatos e assinatura), **Integrações** (Pix fixo ou Asaas), **Dados Fiscais** (catálogo de serviços da nota) e **Lembretes**. Trocar de seção não perde o que foi digitado, e "Salvar alterações" grava tudo junto. Em Integrações ficam a **chave Pix** e a **imagem do QR Code Pix** (a que o app do seu banco gera). Os orçamentos mostram o que estiver cadastrado: QR, chave, ou os dois. O QR é uma imagem fixa: o app mostra o valor ao lado e pede que o cliente o informe ao pagar.
- **Cláusulas e serviços do contrato.** Ficam em [`src/lib/contract.ts`](src/lib/contract.ts). As que vêm no projeto foram escritas para serviços de manutenção de sistemas e edição de listas de dados; ajuste a lista `serviceKinds` e os textos para a sua atividade. São um modelo-base, não uma revisão jurídica.
- **Nome e cor.** O nome aparece em `app/index.html`, na landing page (`index.html`) e em `src/components/layout/Sidebar.tsx`; a cor de destaque é a paleta `brand` em `tailwind.config.js`.

## Publicar na internet

O app é um site estático: qualquer hospedagem de arquivos serve. Abaixo, o caminho pelo **Cloudflare Pages**, que é gratuito e dá um endereço `seu-nome.pages.dev`.

O mesmo build gera duas coisas:
- **Landing page na raiz `/`.** O arquivo é o `index.html` da raiz do projeto, com estilos e scripts em `public/landing/`. O roteiro e as decisões dela estão em [`landing/BRIEF.md`](landing/BRIEF.md).
- **O sistema em `/app`.** A página de entrada é `app/index.html`.

O `public/_redirects` faz duas coisas:
- Abre qualquer tela do sistema a partir de `/app/...`.
- Leva os endereços antigos, de antes da landing, para `/app`. Por exemplo, `/assinar/...` e `/convite/...` já enviados aos clientes, e `/financeiro`.

Em outra hospedagem, reproduza essas regras. Só a landing aparece em buscadores; o `/app` sai com `noindex`.

1. Gere o site com o `.env.local` já preenchido (o build escreve em `dist/_headers` o endereço do seu Supabase, que a política de segurança do site precisa liberar):
   ```bash
   npm run build
   ```
2. No Cloudflare, vá em **Workers & Pages → Create → Pages → Drag and drop your files**, dê um nome ao projeto e envie a pasta `dist` (ou um zip do conteúdo dela).
3. Clique em **Deploy site**.

Para atualizar depois, rode `npm run build` de novo e, no projeto do Pages, use **Create deployment** para enviar a nova pasta `dist`.

#### Publicar a cada `git push` (opcional)

Se o código está no GitHub, o Cloudflare pode fazer o build e publicar sozinho a cada push:

1. No projeto do Pages, em **Settings → Variables and secrets**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (o botão **Import .env** aceita o seu `.env.local`). Faça isso antes de conectar: sem elas o build sai em modo demo.
2. Em **Settings → Build → Git repository**, clique em **Connect**, escolha o repositório e a branch `main`, com build command `npm run build` e output directory `dist`.
3. Se o repositório não aparecer na lista, libere-o para o aplicativo do Cloudflare em [github.com/settings/installations](https://github.com/settings/installations).

A partir daí, cada push na `main` vai para o ar em cerca de um minuto. No Cloudflare, o build da `main` falha se `VITE_SUPABASE_URL` não estiver cadastrada, para não publicar um site que não conecta; as prévias de outros ramos sem a variável saem em modo demo. Para ter um site de prévia ligado ao banco de testes, cadastre as mesmas variáveis no ambiente **Preview** do Pages, com os dados do projeto de testes.

No Supabase, em **Authentication → URL Configuration**:
- Em **Site URL**, coloque o endereço publicado do sistema (por exemplo `https://seu-nome.pages.dev/app/`), para que os e-mails de redefinição de senha apontem para o lugar certo.
- Em **Redirect URLs**, inclua `https://seu-nome.pages.dev/app/**`. A confirmação de cadastro, o login com Google e GitHub e o aceite de convite voltam para telas dentro de `/app`.

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
- Todo **orçamento** tem um lançamento no Financeiro: pendente enquanto aguarda pagamento, pago quando você marca o orçamento como pago. Marcar o lançamento como pago no Financeiro também marca o orçamento. Excluir um orçamento ainda não pago tira a cobrança do Financeiro.
- **Assinatura da proposta:** em Propostas, "Enviar para assinatura" gera um link que o cliente abre sem cadastro, lê a proposta e assina (nome, CPF/CNPJ e assinatura desenhada). A proposta fica em **Assinatura pendente** e passa a **Assinado** quando ele assina; o PDF passa a trazer o aceite. Se o cliente devolver uma cópia assinada por fora, use "Marcar como assinada". É uma assinatura eletrônica simples (registra data, hora e IP), não uma assinatura com certificado digital ICP-Brasil.
- **Assinatura do contrato:** nos contratos salvos, o botão de caneta gera o link de assinatura, igual ao da proposta. O contrato fica em **Assinatura pendente** e passa a **Assinado** quando o cliente assina; se tiver mensalidade, as parcelas entram no Financeiro na hora. Mudar o status para "Assinado" à mão registra uma cópia assinada recebida por fora.
- **Sua assinatura:** em **Minha empresa**, desenhe a sua assinatura ou envie a foto dela em papel (o fundo é removido). Ela sai no campo do emitente das propostas e dos contratos, inclusive nos links enviados ao cliente.
- Ao marcar uma **proposta como aprovada**, o sistema pergunta como o cliente vai pagar (valor integral ou entrada + saldo, por exemplo 50%) e cria o orçamento aguardando pagamento, com os mesmos itens e valor, que já aparece no Financeiro.
- Orçamento com **entrada + saldo** gera dois lançamentos no Financeiro (1/2 e 2/2) que somam o total. Paga a entrada, ele fica **parcialmente pago**; pago o saldo, fica **pago**. No Gerador de Orçamentos, use "Registrar entrada" e "Registrar saldo"; ou marque os lançamentos como pagos no Financeiro. Paga a entrada, "Gerar orçamento do saldo" (no menu do orçamento) gera o documento da parte 2: emitido no dia, com o vencimento do saldo escolhido na hora (a data vai também para o Financeiro), a entrada marcada como paga e o valor do saldo para pagar. Com o Asaas, a cobrança do saldo é gerada junto. Uma proposta tem um único orçamento: para cobrar só uma parte, edite o orçamento dela em vez de criar outro. Se depois você concluir um projeto criado a partir dessa proposta, o valor não é lançado de novo.
- **Mensalidade:** no Gerador de Orçamentos, marque "Cobrar todo mês", escolha o vencimento (ele define o dia de todo mês) e com quantos dias de antecedência gerar. O orçamento salvo é o primeiro mês; depois, todo dia de manhã, a função `billing` gera o do mês seguinte, igual ao último da série (itens, valor e observações), só com a data nova, lança no Financeiro e, no Asaas, gera a cobrança. Para mudar o valor dos próximos meses, edite o último orçamento da série. Na lista "Mensalidades" dá para gerar a próxima na hora, pausar, retomar ou encerrar. O app também confere ao abrir, sem duplicar.
- Em cada recebimento dá para guardar a **nota fiscal** emitida (PDF de até 5 MB), na coluna "Nota fiscal" da aba A receber, ao lado do comprovante. Os arquivos ficam em um espaço privado, acessível só com o seu login.
- Ao lançar uma transação, escolha **Repetir: todo mês** e informe por quantos meses: o sistema cria uma parcela por mês a partir do vencimento. O quadro **Recorrências** do Financeiro mostra quanto entra por mês, quantas parcelas faltam e até quando. **Encerrar** remove só as parcelas que ainda não venceram.
- No Gerador de Contratos, marque **Este contrato tem mensalidade** e informe o valor mensal e o tempo de contrato. Ao mudar o contrato para **Assinado**, as mensalidades entram no Financeiro como pendentes (a primeira no vencimento informado ou, sem data, um mês após a assinatura). Ao mudar para **Encerrado**, o sistema oferece remover as que ainda não venceram.
- No Financeiro, o **saldo** é o que foi recebido menos o que foi pago dentro do período escolhido (pela data do pagamento); os demais cartões consideram o que vence dentro dele. Em "Tudo", o saldo é o acumulado geral.
- A **margem do projeto** é o valor cobrado nas demandas menos as despesas que você lançou no financeiro ligadas àquele projeto.
- O progresso das **metas** é medido pelo sistema (recebimentos pagos, clientes ou projetos criados no período) somado ao valor manual que você informar.
- Todas as listas mostram **10 itens por página**.

### Cobrança pelo Asaas

- Em **Minha empresa → Forma de cobrança**, escolha entre **Simples** (chave Pix e QR Code fixo, baixa manual) e **Asaas** (cobrança com vencimento, multa, juros, desconto e baixa automática). Dá para voltar para o simples quando quiser.
- No Asaas, defina a multa (para pessoa física a lei limita a 2%), os juros ao mês, o desconto para pagamento antecipado, as formas aceitas (Pix, boleto, cartão ou o cliente escolhe) e se o Asaas avisa o cliente por e-mail e SMS.
- **Gerar cobrança:** no Financeiro (menu ⋯ de um recebimento) ou no Gerador de Orçamentos. O cliente precisa ter CPF/CNPJ cadastrado e o vencimento não pode estar no passado. Depois dá para copiar o link, copiar o Pix copia e cola, mandar pelo WhatsApp, atualizar a situação ou cancelar.
- O PDF do orçamento passa a trazer o QR Code Pix da própria cobrança (que já calcula multa e juros se pago com atraso), o link de pagamento e as regras de atraso.
- Quando o cliente paga, o lançamento vira **pago** sozinho (e o orçamento junto). Se você marcar como pago à mão (dinheiro, transferência), o app dá baixa no Asaas como "recebido por fora", para o cliente não pagar de novo; desfazer reabre a cobrança. Pagamento recebido pelo Asaas só pode ser estornado no painel do Asaas.
- Mudar o valor ou o vencimento de um lançamento atualiza a cobrança. Excluir um lançamento (ou encerrar a recorrência, ou excluir o orçamento) cancela a cobrança aberta antes; se o Asaas recusar, nada é excluído.
- As taxas são as do seu plano no Asaas; o valor líquido de cada cobrança fica registrado.

### Nota fiscal (NFS-e) pelo Asaas

- **Antes da primeira nota:** no Asaas, em **Notas Fiscais → Configurações → Informações Fiscais**, ative "Emito NFS-e pelo Portal Nacional", informe se a empresa é optante pelo Simples Nacional e faça o cadastro pedido. No app, em **Minha empresa → Nota fiscal**, use "Usar os serviços dos meus CNAEs" (o código de tributação nacional de cada serviço pode ser buscado na tabela dentro do próprio gerador).
- **Emitir:** em **Ferramentas → Gerador de Notas Fiscais**, nas mesmas etapas do Emissor Nacional: **Pessoas** (o recebimento pago de origem, emitente com a situação no Simples lida do Asaas, tomador), **Serviço** (serviço do catálogo, código de tributação nacional com busca na tabela, NBS se a prefeitura exigir, descrição montada pelas opções ou escrita à mão), **Valores** (regime: MEI, ME/EPP do Simples ou fora do Simples; alíquota do ISS, ISS retido, deduções e retenções federais conforme o regime) e **Emitir NFS-e**. A prévia ao lado mostra a nota como vai sair. Se o regime escolhido não bater com o cadastrado no Asaas, a emissão fica bloqueada até corrigir. Embaixo fica a lista das notas emitidas, com PDF, atualização e cancelamento. No Financeiro e no Gerador de Orçamentos, "Emitir nota fiscal" abre o gerador com aquele recebimento já escolhido.
- Descreva só o serviço que a empresa prestou, dentro dos seus CNAEs; trabalho feito como pessoa física não entra. No MEI, o ISS já vai no DAS e a nota sai sem retenções; nos outros regimes, o ISS e as retenções saem na nota.
- Quando a nota é autorizada, o PDF entra sozinho no campo "Nota fiscal" do lançamento. Se for recusada, o motivo aparece no lançamento e dá para emitir de novo. Dá para cancelar pelo menu (o Portal pode recusar fora do prazo). Recebimento com nota emitida não pode ser excluído antes de cancelar a nota.
- O Asaas cobra por nota emitida, conforme o seu plano.

### No celular

- **Instalar como app:** abra o site no celular e use **Instalar app** (no menu lateral do sistema, quando o navegador oferece) ou, no menu do navegador, "Instalar app" / "Adicionar à tela inicial" (no iPhone: Compartilhar → Adicionar à Tela de Início, pelo Safari). Ele abre em tela cheia, com ícone próprio. Também instala no computador pelo Chrome ou Edge.
- O app instalado guarda as telas no aparelho, então abre rápido e mesmo sem internet. **Os dados não ficam guardados:** sem conexão as listas não carregam e nada é salvo. A cada publicação o app se atualiza sozinho na abertura seguinte.
- O menu vira uma gaveta (botão ☰ no topo), as tabelas viram cartões e a agenda mostra o mês com pontos nos dias: toque num dia para ver os compromissos.
- **Assinar no celular:** o quadro de assinatura abre em **tela cheia e deitado**, para ter mais espaço para o dedo. No Android o aparelho gira sozinho; no iPhone o quadro aparece girado e basta virar o aparelho. Vale para a sua assinatura (Minha empresa) e para o cliente nos links de proposta e contrato.

## Segurança

O que já vem configurado:

- Cada linha do banco pertence a um usuário, e as regras de acesso (RLS) garantem que só ele a lê ou altera.
- Os **links de assinatura** (proposta e contrato) são a única parte acessível sem login. Quem tem o link vê só aquele documento: o acesso passa por duas funções do banco que exigem o código aleatório do link, e as tabelas continuam fechadas para visitantes.
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
supabase/functions/         Edge Functions (find-leads, webauthn, billing, reminders)
supabase/tests/database/    testes de acesso (pgTAP)
supabase/config.toml        configuração do Supabase CLI
.github/workflows/          verificação e publicação
public/_headers             cabeçalhos de segurança da hospedagem (host do Supabase entra no build)
```

### Ambientes, verificação e publicação

São dois projetos Supabase: **testes** e **produção**.

- Todo PR passa pela [verificação](.github/workflows/ci.yml): tipos e build do app, tipos das Edge Functions, e um banco descartável que roda todas as migrações do zero e os testes de acesso de [`supabase/tests/database/`](supabase/tests/database/) (um usuário não vê, não altera e não apaga os dados de outro).
- Cada push na `main` [publica](.github/workflows/deploy.yml) migrações e funções no projeto de **testes**.
- A **produção** é publicada pelo botão **Actions → Publicação → Run workflow**, escolhendo `production`. Com "Simular" marcado, só mostra o que mudaria no banco; desmarcado, publica. O ambiente `production` do GitHub pede aprovação.

Cada ambiente do GitHub (Settings → Environments, `test` e `production`) precisa da variável `SUPABASE_PROJECT_REF` e do segredo `SUPABASE_DB_PASSWORD`; o repositório, do segredo `SUPABASE_ACCESS_TOKEN`.

Para rodar o banco e os testes na sua máquina (precisa do Docker):

```bash
npx supabase db start   # Postgres local com todas as migrações
npx supabase test db    # testes de acesso
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
