import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatCurrency = (value: number | null | undefined) => brl.format(Number(value ?? 0))
export const formatCompact = (value: number | null | undefined) => brlCompact.format(Number(value ?? 0))

export function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value
}

export function formatDate(value: string | Date | null | undefined, pattern = 'dd/MM/yyyy') {
  if (!value) return '—'
  return format(toDate(value), pattern, { locale: ptBR })
}

/** Data no formato das colunas `date` do Postgres. */
export const isoDay = (date: Date) => format(date, 'yyyy-MM-dd')

export const formatProposalNumber = (n: number | null | undefined) =>
  `#PROP-${String(n ?? 0).padStart(4, '0')}`

export const formatQuoteNumber = (n: number | null | undefined) => `#ORC-${String(n ?? 0).padStart(4, '0')}`

export function maskCpfCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Devolve o link só se for http(s); qualquer outro esquema é descartado. */
export const safeHttpUrl = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null)

export const sum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)

export function maskCep(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** CPF ou CNPJ com os dígitos verificadores conferidos (não aceita 111.111.111-11). */
export function isValidCpfCnpj(value: string) {
  const d = value.replace(/\D/g, '')
  if (!/^\d{11}$|^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false
  const digit = (len: number, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  if (d.length === 11) {
    const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
    const w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    return digit(9, w1) === Number(d[9]) && digit(10, w2) === Number(d[10])
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  return digit(12, w1) === Number(d[12]) && digit(13, w2) === Number(d[13])
}
