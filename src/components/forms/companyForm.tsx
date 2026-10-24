import { z } from 'zod'
import { Bell, Building2, Plug, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { FieldDef } from './EntityForm'
import { GatewayConnection } from '@/components/billing/GatewayConnection'
import { NfseServicesEditor } from '@/components/billing/NfseServicesEditor'
import { BiometricSettings } from '@/components/auth/BiometricSettings'
import { ReminderSettings } from '@/components/reminders/ReminderSettings'
import { isSupabaseConfigured } from '@/lib/supabase'
import { billingProviders, billingTypes } from '@/lib/billing'
import { maskCpfCnpj, maskPhone } from '@/lib/utils'

const text = z.string()
const email = z.string().email('E-mail inválido').or(z.literal(''))
const phone = z.string().refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Telefone incompleto')
const document = z.string().refine((v) => [0, 11, 14].includes(v.replace(/\D/g, '').length), 'CPF ou CNPJ incompleto')

/** Validação do perfil (Minha empresa): todas as seções salvam juntas. */
export const companySchema = z.object({
  full_name: text.min(2, 'Informe seu nome'),
  company_name: text,
  document,
  email,
  phone,
  pix_key: text.max(140, 'Chave muito longa'),
  pix_qr_image: text.refine((v) => v === '' || v.startsWith('data:image/'), 'Imagem inválida'),
  signature_image: text.refine((v) => v === '' || (v.startsWith('data:image/png;base64,') && v.length <= 200000), 'Assinatura inválida'),
  billing_provider: z.enum(['simple', 'asaas']),
  billing_types: z.enum(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']),
  billing_fine_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(10, 'Até 10%'),
  billing_interest_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(10, 'Até 10% ao mês'),
  billing_discount_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(50, 'Até 50%'),
  billing_discount_days: z.coerce.number({ invalid_type_error: 'Informe um número' }).int('Dias inteiros').min(0, 'Não pode ser negativo').max(60, 'Até 60 dias'),
  billing_notify: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
  nfse_services: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().trim().min(2, 'Dê um nome a cada serviço'),
        cnae: z.string(),
        code: z.string().max(20),
        description: z.string().max(1000),
        nbs: z.string().max(20).optional(),
      }),
    )
    .max(20)
    .nullable()
    .transform((v) => v ?? []),
  nfse_observations: text.max(1000, 'Até 1.000 caracteres'),
  reminder_email: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
  reminder_push: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
  reminder_hour: z.coerce.number().int().min(0).max(23),
})

const asaas = (v: Record<string, any>) => v.billing_provider === 'asaas'
const note = (text: string) => <p className="col-span-2 -mt-2 text-xs text-slate-500 dark:text-slate-400">{text}</p>

export type CompanySectionId = 'dados' | 'integracoes' | 'fiscal' | 'lembretes' | 'seguranca'

export interface CompanySection {
  id: CompanySectionId
  label: string
  description: string
  icon: LucideIcon
  fields: FieldDef[]
}

/** As seções da tela Minha empresa, na ordem do menu. */
export const companySections: CompanySection[] = [
  {
    id: 'dados',
    label: 'Dados da Empresa',
    description: 'Quem você é nos documentos: estes dados aparecem como emitente nas propostas, orçamentos e contratos.',
    icon: Building2,
    fields: [
      { name: 'full_name', label: 'Seu nome', full: true },
      { name: 'company_name', label: 'Empresa (emitente das propostas)', full: true },
      { name: 'document', label: 'CPF / CNPJ', mask: maskCpfCnpj, placeholder: '00.000.000/0000-00' },
      { name: 'phone', label: 'WhatsApp', mask: maskPhone, placeholder: '(00) 00000-0000' },
      { name: 'email', label: 'E-mail de contato', type: 'email', full: true },
      { name: 'signature_image', label: 'Sua assinatura', type: 'signature', hint: 'Sai no campo do emitente das propostas e dos contratos, inclusive nos links enviados para o cliente assinar.' },
    ],
  },
  {
    id: 'integracoes',
    label: 'Integrações',
    description: 'Como os seus clientes pagam os orçamentos e as parcelas do financeiro: Pix fixo ou cobrança pelo Asaas, com multa, juros e baixa automática.',
    icon: Plug,
    fields: [
      { name: 'billing_provider', label: 'Cobrar por', type: 'select', options: (Object.keys(billingProviders) as Array<keyof typeof billingProviders>).map((value) => ({ value, label: billingProviders[value].label })), full: true },
      { name: 'billing_simple_hint', label: '', type: 'custom', showWhen: (v) => !asaas(v), render: () => note(`${billingProviders.simple.hint} Para aplicar multa e juros por atraso, use um gateway.`) },
      { name: 'pix_key', label: 'Chave Pix (para receber)', placeholder: 'CPF/CNPJ, e-mail, telefone ou chave aleatória', full: true, showWhen: (v) => !asaas(v) },
      { name: 'pix_qr_image', label: 'QR Code Pix', type: 'image', hint: 'Imagem do QR Code gerado no app do seu banco. Aparece nos orçamentos.', showWhen: (v) => !asaas(v) },
      { name: 'billing_asaas_hint', label: '', type: 'custom', showWhen: asaas, render: () => note(billingProviders.asaas.hint) },
      { name: 'billing_gateway', label: 'Conexão', type: 'custom', showWhen: asaas, render: ({ setValue }) => <GatewayConnection onProviderChange={(provider) => setValue('billing_provider', provider)} /> },
      { name: 'billing_types', label: 'Formas de pagamento aceitas', type: 'select', options: billingTypes, full: true, showWhen: asaas },
      { name: 'billing_fine_pct', label: 'Multa por atraso (%)', type: 'number', hint: 'Cobrada uma vez, logo após o vencimento. Para pessoa física (consumidor), a lei limita a 2%.', showWhen: asaas },
      { name: 'billing_interest_pct', label: 'Juros ao mês (%)', type: 'number', hint: 'Proporcionais aos dias de atraso. Comum: 1% ao mês.', showWhen: asaas },
      { name: 'billing_discount_pct', label: 'Desconto para pagar antes (%)', type: 'number', hint: '0 = sem desconto.', showWhen: asaas },
      { name: 'billing_discount_days', label: 'Desconto vale até (dias antes)', type: 'number', step: '1', hint: '0 = até o dia do vencimento.', showWhen: asaas },
      { name: 'billing_notify', label: 'Avisos ao cliente', type: 'select', options: [{ value: 'true', label: 'O Asaas avisa o cliente por e-mail e SMS' }, { value: 'false', label: 'Não avisar (eu mando o link)' }], full: true, hint: 'Vale para os clientes cadastrados no Asaas a partir de agora.', showWhen: asaas },
    ],
  },
  {
    id: 'fiscal',
    label: 'Dados Fiscais',
    description: 'Os serviços que você presta e o que vai em toda nota fiscal. A NFS-e é emitida pelo Asaas, no Portal Nacional, em Ferramentas → Gerador de Notas Fiscais.',
    icon: ReceiptText,
    fields: [
      { name: 'nfse_needs_asaas', label: '', type: 'custom', showWhen: (v) => !asaas(v), render: () => <p className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">A emissão de nota fiscal usa o Asaas. Escolha o Asaas em Integrações para emitir; o catálogo abaixo já pode ser preenchido.</p> },
      { name: 'nfse_services', label: 'Serviços', type: 'custom', persist: true, initial: [], render: ({ values, setValue }) => <NfseServicesEditor value={values.nfse_services} onChange={(services) => setValue('nfse_services', services)} /> },
      { name: 'nfse_observations', label: 'Observações em toda nota (opcional)', type: 'textarea' },
    ],
  },
  {
    id: 'lembretes',
    label: 'Lembretes',
    description: 'Todo dia, no horário escolhido, as demandas do dia e as atrasadas chegam por e-mail e como notificação no celular.',
    icon: Bell,
    fields: [
      { name: 'reminder_hour', label: 'Horário (Brasília)', type: 'select', options: Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` })) },
      { name: 'reminder_email', label: 'Por e-mail', type: 'select', options: [{ value: 'true', label: 'Enviar' }, { value: 'false', label: 'Não enviar' }] },
      { name: 'reminder_push', label: 'Notificação no celular', type: 'select', options: [{ value: 'true', label: 'Enviar para os aparelhos ativados' }, { value: 'false', label: 'Não enviar' }], full: true },
      { name: 'reminder_device', label: 'Aparelho', type: 'custom', render: ({ values }) => <ReminderSettings email={values.email ?? ''} /> },
    ],
  },
  ...(isSupabaseConfigured
    ? [
        {
          id: 'seguranca' as const,
          label: 'Segurança',
          description: 'Como o acesso ao app é protegido neste aparelho.',
          icon: ShieldCheck,
          fields: [{ name: 'biometric_device', label: 'Biometria', type: 'custom', render: ({ values }) => <BiometricSettings name={values.full_name} /> }] as FieldDef[],
        },
      ]
    : []),
]
