# Brief — landing page do Meu ERP Freelas

Entrevista feita com o Bruno em 27/10/2026. Respostas anotadas do jeito que ele falou.

## As 7 respostas

1. **O que é e pra quem é**
   - Um sistema de gestão para freelancers que trabalham sozinhos ou em equipe, com clientes, propostas, contratos, projetos, demandas, financeiro e metas, onde cada atendimento vai do primeiro contato até o projeto pronto.
   - Quem visita: freelancers e pequenos prestadores de serviço (dev, designer, social media, MEI, ME) que hoje se organizam com planilha, WhatsApp e bloco de notas e querem parecer mais profissionais para os clientes.
   - Ação: no final da página e durante todo o percurso, o visitante é convidado a criar uma conta grátis e testar o Premium por 14 dias sem precisar cadastrar cartão. O Premium do teste é o plano **Profissional**.
2. **Vibe:** rápido, ousado, moderno, energia de startup, organizado, confiável.
   - Referências: o painel de um carro novo, um filme de tecnologia, uma papelaria bem arrumada.
3. **Caminho:** abertura → a dor → a virada (7 etapas) → o resto do sistema → profissional para o cliente → sozinho ou em equipe → fechamento. Aprovado ("está ótimo").
4. **O que ele precisa acreditar:** "Isso me faz parecer uma empresa de verdade, mesmo trabalhando sozinho."
5. **Energia:**

   | Cena | Energia |
   |---|---|
   | Abertura | intensa |
   | A dor | calma |
   | A virada | **pico** |
   | O resto do sistema | rápida |
   | Visão do cliente | calma e elegante |
   | Equipe | leve |
   | Fechamento | forte |

6. **Movimento-assinatura:** "o painel que liga".
7. **Materiais:**
   - Logotipo: o "F" branco sobre quadrado índigo (`public/favicon.svg`).
   - Cor da marca: índigo `#4F46E5` / `#6366F1`.
   - Não há números reais nem depoimentos: a página fica sem eles.
   - Planos (preços do Bruno; recursos do PDF "Plano: Meu ERP Freelas como SaaS", 24/10/2026):
     - Grátis.
     - Essencial: R$ 29,90/mês.
     - Profissional: R$ 59,90/mês.
     - Teste de 14 dias do Profissional, sem cartão.
   - Nome provisório: **Meu ERP Freelas** (o nome definitivo vem depois).
   - Contato: WhatsApp (74) 99122-6010. O e-mail com domínio próprio ainda não existe.
   - Endereço: a landing fica na raiz `/` e o sistema vai para `/app`.

## Jornada em cenas

| # | Cena | O que VÊ | O que SENTE | O que PASSA A ACREDITAR |
|---|---|---|---|---|
| 1 | **A partida** (abertura) | Fundo escuro. À esquerda, o título "Seu freela com cara de empresa." e o convite (conta grátis + 14 dias do Profissional, sem cartão). À direita, um painel que **dá a partida**: indicadores acendem e os ponteiros sobem | "Isso é rápido e sério" | "Isso é diferente da planilha" |
| 2 | **Cinco lugares** (a dor) | Fundo papel. Pedaços do dia a dia espalhados em profundidade (nota no celular, linha de planilha, mensagem de WhatsApp "e aquele orçamento?", post-it "cobrar sexta?"). Texto curto ancorado à esquerda | Incômodo reconhecível, sem drama | "Meu problema não é falta de cliente, é desorganização" |
| 3 | **A virada** (pico, rolagem longa) | Volta o escuro. O painel ocupa o centro e a rolagem conduz um atendimento real pelas 7 etapas, cada uma acendendo seu indicador: Cliente → Proposta → Assinatura → Cobrança → Contrato → Projeto → Pronto. O ponteiro de valor sobe e os status mudam | Controle, como dirigir um carro novo | "Do primeiro contato ao projeto pronto, eu sei sempre o próximo passo" |
| 4 | **Tudo no lugar** (o resto do sistema) | Fundo papel. Uma "gaveta de papelaria" organizada em grade: demandas (kanban), agenda, financeiro, metas e as ferramentas (calculadora de preço, geradores de orçamento, proposta, contrato e nota). Os blocos entram rápido, em sequência | Agilidade e ordem | "Tem tudo o que eu preciso, sem bagunça" |
| 5 | **O que o seu cliente vê** | Centralizado, elegante. A proposta como o cliente recebe pelo link, com a sua marca. Em etapas: enviada → aberta → assinada | Orgulho | **"Isso me faz parecer uma empresa de verdade"** |
| 6 | **Sozinho hoje, com time amanhã** | Leve. Avatares entrando um a um com os papéis (Dono, Admin, Membro, Leitura/contador) | Tranquilidade sobre o futuro | "Dá pra crescer sem trocar de sistema" |
| 7 | **Planos e partida final** (fechamento) | Os três planos, com o Profissional em destaque ("14 dias grátis, sem cartão"). Chamada única: **Criar conta grátis**. Rodapé com WhatsApp | Decisão fácil, sem risco | "Testar não custa nada" |

Durante toda a página, uma barra fixa discreta no topo (e embaixo, no celular) leva o botão **Criar conta grátis**.

## Curva de energia

```
intensa  ●                 ●                         ●
            \             / \                       /
rápida       \           /   ●                     /
              \         /     \                   /
calma          ●-------/       ●----------●------/
          partida  dor  VIRADA  gaveta  cliente equipe  final
```

Cenas vizinhas nunca têm a mesma energia nem a mesma família de efeito:
- **1 Partida:** palavras + assinatura.
- **2 Dor:** paralaxe e profundidade.
- **3 Virada:** cena fixa com interpolação + assinatura.
- **4 Gaveta:** revelações em sequência.
- **5 Cliente:** cena fixa em etapas.
- **6 Equipe:** revelações laterais.
- **7 Final:** números (preços reais) + fundo que viaja.

## O pico

**A virada.** É uma cena fixa de cerca de 5 telas de rolagem. É a única cena com essa duração, e o painel ocupa a tela inteira.

## Movimento-assinatura — "o painel que liga"

Um painel de instrumentos em HTML/SVG, com mostradores circulares, ponteiros, indicadores e um display central.
- **Na abertura:** dá a partida sozinho. Os ponteiros varrem até o fim e voltam, depois os indicadores acendem em sequência, como na ignição de um carro.
- **Na virada:** passa a obedecer à rolagem. Cada etapa acende um indicador, o ponteiro de "valor da proposta" sobe até o valor do exemplo, e o display mostra o status ("Proposta enviada", "Assinada", "Pago", "Projeto em andamento", "Pronto").

Os valores e nomes do painel são de um **atendimento de exemplo** (como no modo demo), identificado como exemplo. Não são números do produto.

## Paleta e tipografia

| Papel | Cor |
|---|---|
| Fundo escuro (painel) | `#0B0C14`, preto com leve puxão índigo |
| Superfície escura | `#151729` |
| Fundo papel (papelaria) | `#F4F2EC` |
| Tinta clara / escura | `#ECEDF5` / `#15161F` |
| Tinta suave | `#8A8EA6` |
| Acento único | índigo da marca, `#6366F1` |

- O acento aparece pouco: botões, indicadores acesos e o destaque do Profissional.
- Sem degradê, sem neon, sem texto em degradê.

Fontes: **Unbounded** nos títulos (ousada, geométrica, "painel") e **Manrope** no texto (limpa, legível), com números tabulares.

## Pendências

- **Membros por plano:** o PDF propõe 1 / 2 / 5 (mais ~R$ 10 por extra), mas esse item ainda está em aberto no próprio PDF. Até a confirmação, a tabela de planos **não mostra** número de membros, só "Equipe" no Essencial e no Profissional.
- **E-mail de contato:** entra quando o domínio for comprado.
