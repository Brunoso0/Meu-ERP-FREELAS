import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { LEGAL } from '@/lib/legal'

const H = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-lg font-semibold text-slate-900 dark:text-white">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed">{children}</p>
const L = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
)

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          <ArrowLeft className="h-4 w-4" /> Voltar ao {LEGAL.product}
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Atualizada em {LEGAL.updatedAt}</p>
        {children}
        <nav className="mt-12 flex gap-4 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
          <Link to="/termos" className="text-indigo-600 hover:underline dark:text-indigo-400">Termos de uso</Link>
          <Link to="/privacidade" className="text-indigo-600 hover:underline dark:text-indigo-400">Política de privacidade</Link>
        </nav>
      </div>
    </div>
  )
}

const contact = LEGAL.contactEmail ?? 'o canal de contato dentro do próprio app'
const who = LEGAL.legalName ? `${LEGAL.legalName}${LEGAL.document ? ` (${LEGAL.document})` : ''}` : `a equipe do ${LEGAL.product}`

export function Terms() {
  return (
    <Shell title="Termos de uso">
      <P>Estes termos valem para o uso do {LEGAL.product}, um sistema de gestão para freelancers e pequenas empresas (clientes, propostas, contratos, financeiro, agenda e demandas), operado por {who}. Ao criar uma conta ou usar o app, você concorda com eles.</P>
      <H>1. Sua conta</H>
      <L items={['Você informa dados verdadeiros e mantém a senha em segredo. O que for feito com a sua conta é de sua responsabilidade.', 'Recomendamos ativar a verificação em duas etapas, disponível em Minha empresa &gt; Segurança.', 'Você precisa ter capacidade legal para contratar. O uso é profissional: o app não é voltado a menores de idade.']} />
      <H>2. O que você pode fazer</H>
      <P>Usar o app para organizar o seu trabalho e o de sua equipe, dentro dos limites do seu plano. Não é permitido usar o app para atividades ilegais, enviar conteúdo ilícito ou que viole direitos de terceiros, tentar acessar dados de outras contas, sobrecarregar ou burlar a segurança do serviço, nem revender o acesso sem autorização.</P>
      <H>3. Seus dados e os dos seus clientes</H>
      <P>O que você cadastra (clientes, propostas, contratos, lançamentos) continua sendo seu. Em relação aos dados pessoais dos seus clientes, é você quem decide por que e como usá-los: o {LEGAL.product} apenas os armazena e processa a seu pedido. Você é responsável por ter base legal para cadastrá-los e por atender os pedidos deles. Veja a <Link to="/privacidade" className="text-indigo-600 underline dark:text-indigo-400">Política de privacidade</Link>.</P>
      <H>4. Planos e pagamento</H>
      <P>Há um plano gratuito e planos pagos, com valores e limites mostrados no app antes da contratação. A cobrança dos planos pagos é feita por meio de um provedor de pagamentos e renova no ciclo escolhido até o cancelamento. Você pode cancelar quando quiser; o acesso pago segue até o fim do período já pago. Mudanças de preço são avisadas com antecedência e só valem a partir da renovação seguinte. Direitos de arrependimento previstos no Código de Defesa do Consumidor são respeitados.</P>
      <H>5. Disponibilidade</H>
      <P>Trabalhamos para manter o app no ar e fazemos cópias de segurança periódicas, mas não garantimos que ele funcionará sem interrupções ou erros. Manutenções e falhas de terceiros (hospedagem, internet, provedores) podem causar indisponibilidade.</P>
      <H>6. Documentos gerados no app</H>
      <P>Modelos de propostas, orçamentos e contratos são apoio, não aconselhamento jurídico, contábil ou fiscal. Revise tudo antes de enviar ou assinar. Assinaturas feitas por link no app registram data, hora e dados de acesso, mas a validade jurídica em cada caso deve ser avaliada por você.</P>
      <H>7. Responsabilidade</H>
      <P>Na medida permitida em lei, o {LEGAL.product} não responde por lucros cessantes, perda de negócios ou danos indiretos, nem por decisões tomadas com base nas informações do app. Nada aqui limita direitos que a lei garante ao consumidor.</P>
      <H>8. Encerramento</H>
      <P>Você pode apagar a sua conta a qualquer momento em Minha empresa &gt; Segurança, e baixar os seus dados antes. Podemos suspender ou encerrar contas que violem estes termos, avisando sempre que possível.</P>
      <H>9. Mudanças e contato</H>
      <P>Podemos atualizar estes termos; mudanças relevantes serão avisadas no app ou por e-mail. Continuar usando depois do aviso significa concordar com a nova versão. Dúvidas: {contact}. Aplica-se a lei brasileira, e o foro é o do seu domicílio quando você for consumidor.</P>
    </Shell>
  )
}

export function Privacy() {
  return (
    <Shell title="Política de privacidade">
      <P>Esta política explica quais dados pessoais o {LEGAL.product} trata, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). O controlador dos dados da sua conta é {who}. Contato para assuntos de privacidade: {contact}.</P>
      <H>1. Quais dados tratamos</H>
      <L items={[
        'Da sua conta: nome, e-mail, senha (guardada apenas de forma criptografada), foto de perfil e dados da empresa que você informa (CPF/CNPJ, telefone, endereço, assinatura).',
        'Do seu trabalho: o que você cadastra, como clientes, propostas, contratos, lançamentos financeiros, tarefas e arquivos. Isso inclui dados pessoais dos seus clientes, que tratamos como operador, a seu pedido.',
        'De segurança: verificação em duas etapas (códigos de recuperação guardados só em forma irreversível), aparelhos confiáveis, registros de login e de uso para evitar abuso.',
        'Técnicos: registro de erros do app (mensagem do erro, tela, navegador e identificador da conta), sem e-mail, nome ou conteúdo das telas. São apagados após 90 dias.',
        'De pagamento: quando você assina um plano ou cobra clientes, o provedor de pagamentos processa os dados do cartão ou do Pix. Nós não guardamos número de cartão.',
      ]} />
      <H>2. Para que usamos</H>
      <L items={['Prestar o serviço que você contratou e dar suporte (execução de contrato).', 'Proteger contas e prevenir fraudes (legítimo interesse).', 'Cobrar planos e cumprir obrigações legais e fiscais.', 'Corrigir erros e melhorar o app, com dados técnicos mínimos (legítimo interesse).', 'Enviar avisos do serviço, como confirmação de e-mail, lembretes que você ativou e mudanças nestes termos.']} />
      <P>Não vendemos dados pessoais nem os usamos para publicidade de terceiros.</P>
      <H>3. Com quem compartilhamos</H>
      <P>Apenas com empresas que prestam serviços necessários ao app, sob contrato:</P>
      <L items={['Supabase: banco de dados, autenticação e arquivos.', 'Cloudflare: hospedagem e entrega do app.', 'Asaas e outros provedores de pagamento que você ou nós conectarmos: cobranças.', 'Provedor de envio de e-mails: mensagens do sistema.', 'Google: login com Google e busca de empresas (ferramenta de leads), quando você usa esses recursos.']} />
      <P>Alguns desses provedores podem tratar dados fora do Brasil; nesses casos exigimos garantias adequadas, como previsto na LGPD. Também podemos compartilhar dados por ordem judicial ou obrigação legal.</P>
      <H>4. Por quanto tempo guardamos</H>
      <P>Enquanto a conta existir. Ao apagá-la, seus dados e os dos workspaces em que você é o único integrante são removidos de forma definitiva. Cópias de segurança criptografadas podem reter esses dados por até 30 dias antes de expirarem. Dados de cobrança e fiscais podem ser mantidos pelo prazo exigido em lei.</P>
      <H>5. Seus direitos</H>
      <P>Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento, eliminação e revogação de consentimento. No app: <strong>Minha empresa &gt; Segurança &gt; Seus dados</strong> permite baixar tudo o que está na sua conta e apagá-la. Para outros pedidos, escreva para {contact}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</P>
      <H>6. Armazenamento no navegador</H>
      <P>Usamos apenas o armazenamento essencial do navegador (sessão de login, preferências como tema e aparelho confiável). Não usamos cookies de publicidade nem de rastreamento.</P>
      <H>7. Segurança</H>
      <P>Adotamos criptografia em trânsito, isolamento dos dados entre contas no banco, verificação em duas etapas opcional e cópias de segurança criptografadas. Nenhum sistema é infalível; em caso de incidente com risco relevante, avisaremos você e a ANPD conforme a lei.</P>
      <H>8. Seus clientes</H>
      <P>Se você cadastra dados de outras pessoas no app, você é quem decide como usá-los e responde a elas. Se uma dessas pessoas nos procurar, indicaremos que fale com você.</P>
      <H>9. Mudanças</H>
      <P>Se esta política mudar de forma relevante, avisaremos no app ou por e-mail.</P>
    </Shell>
  )
}
