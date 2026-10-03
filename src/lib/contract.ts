import type { Client, Profile, Proposal } from '@/types/database.types'
import { formatCurrency, formatDate, formatProposalNumber } from './utils'

export interface ContractParams {
  title: string
  /** Tipos de serviço marcados (ids de `serviceKinds`). */
  services: string[]
  /** Complemento livre do objeto. */
  objectDetails: string
  executionDays: number
  revisionLimit: number
  paymentDays: number
  latePenaltyPct: number
  terminationPenaltyPct: number
  noticeDays: number
  warrantyDays: number
  responseHours: number
  termMonths: number
  forum: string
  /** Cláusulas opcionais ligadas (ids de `contractClauses`). */
  clauses: string[]
}

/**
 * Descrições de serviço pensadas para quem presta manutenção de sistemas e
 * tratamento de dados. O texto do contrato deve descrever o que é feito de
 * fato e bater com a atividade da nota fiscal.
 */
export const serviceKinds = [
  { id: 'maintenance', label: 'Manutenção de sistemas de informação', text: 'manutenção corretiva e preventiva de sistemas de informação já existentes' },
  { id: 'support', label: 'Suporte técnico', text: 'suporte técnico aos usuários e acompanhamento do funcionamento dos sistemas' },
  { id: 'config', label: 'Configuração e parametrização', text: 'configuração, parametrização e atualização de sistemas e ferramentas já utilizados pela CONTRATANTE' },
  { id: 'data', label: 'Edição de listas e cadastros', text: 'edição, organização, padronização e atualização de listas de dados e informações cadastrais' },
  { id: 'typing', label: 'Digitação e preparação de documentos', text: 'digitação, conferência e preparação de documentos e planilhas' },
] as const

interface ClauseContext {
  p: ContractParams
  proposal: Proposal | undefined
  value: string
}

export interface ClauseDef {
  id: string
  title: string
  /** Por que ligar esta cláusula (aparece na lista de opções). */
  hint: string
  /** Obrigatórias não podem ser removidas. */
  required?: boolean
  /** Ligada por padrão num contrato novo. */
  recommended?: boolean
  body: (ctx: ClauseContext) => string[]
}

const blank = (value: string | null | undefined, placeholder: string) => value?.trim() || `[${placeholder}]`

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join('; ')}; e ${items[items.length - 1]}`

/**
 * Biblioteca de cláusulas, na ordem em que entram no contrato. É um
 * modelo-base: vale revisar com um advogado antes de usar em casos sensíveis.
 */
export const contractClauses: ClauseDef[] = [
  {
    id: 'object',
    title: 'Objeto',
    hint: 'O que será prestado. Sempre presente.',
    required: true,
    body: ({ p, proposal }) => {
      const kinds = serviceKinds.filter((k) => p.services.includes(k.id)).map((k) => k.text)
      const reference = proposal ? `, conforme a proposta comercial ${formatProposalNumber(proposal.proposal_number)}` : ''
      return [
        `A CONTRATADA prestará à CONTRATANTE serviços de **${kinds.length ? joinList(kinds) : '[descrição dos serviços]'}**${reference}.`,
        p.objectDetails.trim() ? `Detalhamento: ${p.objectDetails.trim()}` : '',
      ]
    },
  },
  {
    id: 'nature',
    title: 'Natureza e limites dos serviços',
    hint: 'Deixa claro que o trabalho é sobre sistemas e dados que já existem, não a criação de software.',
    recommended: true,
    body: () => [
      'Os serviços são executados sobre sistemas, ferramentas, arquivos e bases de dados **já existentes e de titularidade ou licença da CONTRATANTE**, e consistem em mantê-los em funcionamento, ajustá-los, configurá-los e tratar os dados neles contidos.',
      'Não fazem parte deste contrato a criação de programas de computador sob encomenda, o licenciamento ou a cessão de software, nem a hospedagem de sistemas. Necessidades dessa natureza dependem de contratação específica com fornecedor habilitado.',
    ],
  },
  {
    id: 'term',
    title: 'Prazo de execução',
    hint: 'Para serviços com entrega definida (um lote de dados, um ajuste pontual).',
    recommended: true,
    body: ({ p }) => [
      `Os serviços serão concluídos em até **${p.executionDays} dias corridos**, contados da assinatura deste contrato e do recebimento de todos os acessos e materiais necessários.`,
      'Atrasos da CONTRATANTE no envio de materiais, acessos ou aprovações prorrogam o prazo na mesma proporção.',
    ],
  },
  {
    id: 'recurring',
    title: 'Vigência e renovação',
    hint: 'Para manutenção mensal continuada. Use no lugar do prazo de execução.',
    body: ({ p }) => [
      `Este contrato vigora por **${p.termMonths} meses** a partir da assinatura e se renova automaticamente por períodos iguais, salvo manifestação contrária de qualquer das partes com ${p.noticeDays} dias de antecedência.`,
      'A cada renovação, o valor poderá ser reajustado pela variação do IPCA acumulado no período, ou por outro índice que venha a substituí-lo.',
    ],
  },
  {
    id: 'payment',
    title: 'Valor e pagamento',
    hint: 'Valor, vencimento e multa por atraso. Sempre presente.',
    required: true,
    body: ({ p, proposal, value }) => [
      `Pelos serviços, a CONTRATANTE pagará o valor ${p.clauses.includes('recurring') ? 'mensal' : 'total'} de **${value}**.`,
      proposal?.payment_terms ? `Condições: ${proposal.payment_terms}` : '',
      `Cada cobrança vence em até **${p.paymentDays} dias** após a emissão. O atraso sujeita a CONTRATANTE a multa de **${p.latePenaltyPct}%** sobre o valor em aberto e juros de 1% ao mês, e autoriza a CONTRATADA a suspender os serviços até a regularização.`,
    ],
  },
  {
    id: 'invoice',
    title: 'Nota fiscal e tributos',
    hint: 'Você é MEI: registra a emissão de nota e que cada parte arca com os próprios tributos.',
    recommended: true,
    body: () => [
      'A CONTRATADA é Microempreendedor Individual (MEI) e emitirá nota fiscal de serviços correspondente a cada pagamento, quando solicitada pela CONTRATANTE ou exigida pela legislação.',
      'Cada parte responde pelos tributos de sua competência. O valor contratado já inclui os tributos devidos pela CONTRATADA.',
    ],
  },
  {
    id: 'client_duties',
    title: 'Obrigações da contratante',
    hint: 'Acessos, materiais e uma pessoa de contato. Evita atraso que não é seu.',
    recommended: true,
    body: () => [
      'Cabe à CONTRATANTE: (a) fornecer os acessos, arquivos e informações necessários à execução; (b) indicar uma pessoa responsável por esclarecer dúvidas e aprovar as entregas; (c) manter válidas as licenças dos sistemas e ferramentas que utiliza; e (d) efetuar os pagamentos nas datas combinadas.',
      'A CONTRATADA não responde por atrasos ou falhas decorrentes de informações incorretas, acessos indisponíveis ou materiais entregues fora do prazo.',
    ],
  },
  {
    id: 'credentials',
    title: 'Acessos e credenciais',
    hint: 'Como você recebe e devolve senhas e acessos aos sistemas do cliente.',
    recommended: true,
    body: () => [
      'Os acessos concedidos à CONTRATADA serão individuais, limitados ao necessário para a execução dos serviços e usados exclusivamente para esse fim.',
      'Encerrado o contrato, a CONTRATANTE deverá revogar os acessos e trocar as senhas compartilhadas. A CONTRATADA não responde por acessos realizados com credenciais que a CONTRATANTE deixou de revogar.',
    ],
  },
  {
    id: 'backup',
    title: 'Cópias de segurança',
    hint: 'Quem trabalha em dados e sistemas de terceiros precisa disso: o backup é do cliente.',
    recommended: true,
    body: () => [
      'A CONTRATANTE é responsável por manter cópias de segurança atualizadas de seus sistemas e dados antes do início de cada intervenção.',
      'A CONTRATADA adotará os cuidados razoáveis na execução, mas não responde pela perda de dados que poderiam ser recuperados a partir de cópia de segurança que cabia à CONTRATANTE manter.',
    ],
  },
  {
    id: 'lgpd',
    title: 'Proteção de dados pessoais (LGPD)',
    hint: 'Essencial se as listas têm dados de pessoas (clientes, funcionários, contatos).',
    recommended: true,
    body: () => [
      'Para os fins da Lei nº 13.709/2018 (LGPD), a CONTRATANTE é a controladora dos dados pessoais tratados e a CONTRATADA atua como operadora, tratando-os apenas conforme as instruções da CONTRATANTE e para a execução deste contrato.',
      'A CONTRATADA não utilizará os dados para finalidade própria, não os compartilhará com terceiros sem autorização e comunicará à CONTRATANTE, em prazo razoável, qualquer incidente de segurança de que tenha conhecimento.',
      'Ao término do contrato, a CONTRATADA devolverá ou eliminará os dados pessoais que estiverem em seu poder, salvo obrigação legal de guarda.',
    ],
  },
  {
    id: 'confidentiality',
    title: 'Confidencialidade',
    hint: 'Sigilo sobre o que você vê nos sistemas e cadastros do cliente.',
    recommended: true,
    body: () => [
      'As partes manterão em sigilo as informações comerciais, técnicas e cadastrais a que tiverem acesso em razão deste contrato, durante sua vigência e por 2 anos após o término.',
    ],
  },
  {
    id: 'revisions',
    title: 'Alterações e refações',
    hint: 'Limita quantas vezes o cliente pode pedir para refazer sem custo.',
    recommended: true,
    body: ({ p }) => [
      `Estão incluídas até **${p.revisionLimit} rodadas de ajuste** por entrega, limitadas ao escopo contratado e solicitadas em até 7 dias da entrega.`,
      'Ajustes adicionais ou pedidos fora do escopo serão orçados à parte e só começam após aprovação por escrito.',
    ],
  },
  {
    id: 'acceptance',
    title: 'Entrega e aceite',
    hint: 'Define quando a entrega é considerada aprovada, mesmo sem resposta.',
    body: () => [
      'Cada entrega será comunicada à CONTRATANTE, que terá 5 dias úteis para apontar, por escrito, eventuais divergências em relação ao combinado.',
      'Sem manifestação nesse prazo, a entrega será considerada aceita.',
    ],
  },
  {
    id: 'warranty',
    title: 'Garantia do serviço',
    hint: 'Prazo em que você corrige sem custo o que foi feito por você.',
    recommended: true,
    body: ({ p }) => [
      `A CONTRATADA corrigirá, sem custo, falhas decorrentes diretamente dos serviços prestados que forem comunicadas em até **${p.warrantyDays} dias** após a entrega.`,
      'A garantia não cobre problemas causados por alterações feitas pela CONTRATANTE ou por terceiros, por atualizações de sistemas de fornecedores, por falhas de infraestrutura ou por uso em desacordo com as orientações da CONTRATADA.',
    ],
  },
  {
    id: 'sla',
    title: 'Atendimento e prazos de resposta',
    hint: 'Para manutenção continuada: horário de atendimento e tempo de primeira resposta.',
    body: ({ p }) => [
      `Os chamados serão atendidos em dias úteis, em horário comercial, com primeira resposta em até **${p.responseHours} horas úteis** a partir do registro pelo canal combinado.`,
      'O prazo de solução depende da complexidade de cada chamado e será informado no primeiro retorno. Atendimentos fora do horário comercial ou em caráter de urgência serão orçados à parte.',
    ],
  },
  {
    id: 'ownership',
    title: 'Titularidade dos dados e materiais',
    hint: 'Os dados e sistemas continuam do cliente; seus métodos e modelos continuam seus.',
    recommended: true,
    body: () => [
      'Os sistemas, bases de dados, listas e documentos da CONTRATANTE permanecem de sua exclusiva titularidade, inclusive nas versões tratadas ou atualizadas pela CONTRATADA.',
      'Os métodos de trabalho, modelos e roteiros de uso geral empregados pela CONTRATADA permanecem de sua titularidade.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitação de responsabilidade',
    hint: 'Limita sua responsabilidade ao valor do contrato. Importante para quem é MEI.',
    recommended: true,
    body: () => [
      'A responsabilidade da CONTRATADA por danos decorrentes deste contrato fica limitada aos danos diretos comprovados e ao valor efetivamente pago pela CONTRATANTE nos 12 meses anteriores ao fato, não abrangendo lucros cessantes nem danos indiretos.',
      'Essa limitação não se aplica em caso de dolo.',
    ],
  },
  {
    id: 'independence',
    title: 'Ausência de vínculo empregatício',
    hint: 'Registra que você presta serviço com autonomia, sem subordinação nem exclusividade.',
    recommended: true,
    body: () => [
      'Este contrato tem natureza civil e não gera vínculo empregatício, societário ou de representação entre as partes.',
      'A CONTRATADA executa os serviços com autonomia, sem subordinação, controle de jornada ou exclusividade, podendo atender outros clientes e definir os meios e horários de trabalho.',
    ],
  },
  {
    id: 'communication',
    title: 'Comunicação entre as partes',
    hint: 'Define o canal oficial para pedidos e aprovações (e-mail, WhatsApp).',
    body: () => [
      'Pedidos, aprovações e avisos relacionados a este contrato serão feitos por escrito, pelos canais de e-mail ou mensagem indicados pelas partes, e valem como registro do que foi combinado.',
    ],
  },
  {
    id: 'termination',
    title: 'Rescisão',
    hint: 'Aviso prévio e multa para encerramento antecipado.',
    recommended: true,
    body: ({ p }) => [
      `Qualquer das partes pode rescindir este contrato mediante aviso por escrito com ${p.noticeDays} dias de antecedência. A parte que rescindir sem justa causa pagará multa de **${p.terminationPenaltyPct}%** sobre o saldo remanescente do contrato.`,
      'Em qualquer hipótese, os serviços já executados até a data da rescisão serão pagos proporcionalmente.',
    ],
  },
  {
    id: 'forum',
    title: 'Foro',
    hint: 'Onde eventuais disputas são resolvidas. Sempre presente.',
    required: true,
    body: ({ p }) => [`Fica eleito o foro da comarca de **${blank(p.forum, 'cidade/UF')}** para resolver quaisquer questões oriundas deste contrato.`],
  },
]

export const defaultClauses = contractClauses.filter((c) => c.recommended).map((c) => c.id)

/** Monta o contrato em markdown simples (#, ##, parágrafos, **negrito**). */
export function buildContractMarkdown(
  params: ContractParams,
  proposal: Proposal | undefined,
  client: Client | undefined,
  profile: Profile | undefined,
) {
  const contractor = blank(profile?.company_name || profile?.full_name, 'nome da contratada')
  const contractorDoc = blank(profile?.document, 'CPF/CNPJ da contratada')
  const customer = blank(client?.company_name || client?.name, 'nome do contratante')
  const customerDoc = blank(client?.document, 'CPF/CNPJ do contratante')
  const representative = client?.company_name && client?.name ? `, neste ato representada por **${client.name}**` : ''
  const ctx: ClauseContext = { p: params, proposal, value: proposal ? formatCurrency(proposal.total_amount) : '[valor]' }

  const lines = [
    '# Contrato de Prestação de Serviços',
    '',
    `**CONTRATADA:** ${contractor}, inscrita no CPF/CNPJ sob o nº ${contractorDoc}.`,
    '',
    `**CONTRATANTE:** ${customer}, inscrita no CPF/CNPJ sob o nº ${customerDoc}${representative}.`,
    '',
    'As partes acima identificadas celebram este contrato, que se regerá pelas cláusulas a seguir.',
  ]

  contractClauses
    .filter((c) => c.required || params.clauses.includes(c.id))
    .forEach((clause, index) => {
      lines.push('', `## Cláusula ${index + 1}ª — ${clause.title}`)
      clause.body(ctx).filter(Boolean).forEach((paragraph) => lines.push('', paragraph))
    })

  lines.push(
    '',
    `${blank(params.forum, 'cidade/UF')}, ${formatDate(new Date(), "dd 'de' MMMM 'de' yyyy")}.`,
    '',
    '______________________________',
    `${contractor} (CONTRATADA)`,
    '',
    '______________________________',
    `${customer} (CONTRATANTE)`,
  )

  return lines.join('\n')
}
