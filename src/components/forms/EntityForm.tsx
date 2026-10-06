import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import type { ZodTypeAny } from 'zod'
import { ImagePlus, Trash2 } from 'lucide-react'
import { confirm } from '@/components/ui/confirm'
import { Sheet } from '@/components/ui/overlays'
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useInsertMany, useRemove, useUpdate } from '@/hooks/useData'
import { imageToDataUrl } from '@/lib/image'
import type { TableName } from '@/types/database.types'

export interface FieldDef {
  name: string
  label: string
  /** `image` guarda a imagem como data URL no próprio registro. */
  type?: 'text' | 'email' | 'number' | 'date' | 'datetime' | 'select' | 'textarea' | 'image'
  /** Texto de ajuda abaixo do campo. */
  hint?: string
  options?: Array<{ value: string; label: string }>
  /** Opção vazia do select (ex.: "Sem projeto"). */
  emptyOption?: string
  mask?: (value: string) => string
  placeholder?: string
  step?: string
  /** Ocupa a linha inteira no grid de 2 colunas. */
  full?: boolean
  /** Campo que só existe ao criar e não é coluna do registro (ex.: repetição). */
  createOnly?: boolean
  /** Mostra o campo só quando a condição vale para os valores atuais. */
  showWhen?: (values: Record<string, any>) => boolean
}

interface EntityFormProps {
  open: boolean
  onClose: () => void
  /** Nome da entidade no singular, com artigo: "o cliente", "a demanda". */
  noun: string
  title: string
  table: TableName
  fields: FieldDef[]
  schema: ZodTypeAny
  record?: Record<string, any>
  defaults?: Record<string, any>
  variant?: 'drawer' | 'modal'
  /** Falso para registros que não podem ser excluídos (ex.: o próprio perfil). */
  allowDelete?: boolean
  /** Ao criar, desdobra o que foi preenchido em uma ou mais linhas (ex.: parcelas mensais). */
  expand?: (payload: Record<string, any>) => Record<string, any>[]
}

function initialValues(fields: FieldDef[], source: Record<string, any> | undefined) {
  const values: Record<string, any> = {}
  for (const f of fields) {
    const raw = source?.[f.name]
    if (raw === null || raw === undefined) values[f.name] = f.type === 'select' && !f.emptyOption ? f.options?.[0]?.value ?? '' : ''
    else if (f.type === 'datetime') values[f.name] = format(parseISO(raw), "yyyy-MM-dd'T'HH:mm")
    else values[f.name] = raw
  }
  return values
}

function ImageField({ field, value, error, onChange }: { field: FieldDef; value: string; error?: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      onChange(await imageToDataUrl(file))
    } catch (err) {
      toast.error('Imagem não aceita', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <div className="col-span-2">
      <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">{field.label}</span>
      <div className="flex items-center gap-4 rounded-lg border p-3">
        {value ? (
          <img src={value} alt={field.label} className="h-24 w-24 shrink-0 rounded-md border bg-white object-contain p-1" />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed text-slate-400">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 space-y-2">
          {field.hint && <p className="text-xs text-slate-500 dark:text-slate-400">{field.hint}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              {value ? 'Trocar imagem' : 'Enviar imagem'}
            </Button>
            {value && (
              <Button variant="danger" size="sm" onClick={() => onChange('')}>
                Remover
              </Button>
            )}
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} aria-label={field.label} />
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}

/**
 * Formulário de criação/edição dirigido por configuração: cada entidade
 * declara campos + schema Zod em GlobalModals e este componente cuida de
 * validação, máscaras, salvar, excluir e feedback.
 */
export function EntityForm({ open, onClose, noun, title, table, fields: allFields, schema, record, defaults, variant = 'drawer', allowDelete = true, expand }: EntityFormProps) {
  const fields = record ? allFields.filter((f) => !f.createOnly) : allFields
  const insert = useInsert(table)
  const insertMany = useInsertMany(table)
  const update = useUpdate(table)
  const remove = useRemove(table)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, any>>({ resolver: zodResolver(schema), defaultValues: initialValues(fields, record ?? defaults) })

  // `fields` é recriado a cada render do pai; reiniciar só quando abre ou troca o registro
  useEffect(() => {
    if (open) reset(initialValues(fields, record ?? defaults))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id])

  const submit = handleSubmit(async (values) => {
    const payload: Record<string, any> = {}
    for (const f of fields) {
      let v = values[f.name]
      if (v === '' || v === undefined) v = null
      else if (f.type === 'datetime') v = new Date(v).toISOString()
      payload[f.name] = v
    }
    try {
      const rows = record ? [] : expand ? expand(payload) : [payload]
      if (record) await update.mutateAsync({ id: record.id, patch: payload })
      else if (rows.length === 1) await insert.mutateAsync(rows[0])
      else await insertMany.mutateAsync(rows)
      toast.success(record ? 'Alterações salvas' : rows.length > 1 ? `${rows.length} lançamentos criados` : 'Registro criado')
      onClose()
    } catch {
      // o hook já mostrou o toast de erro; mantém o formulário aberto
    }
  })

  const handleDelete = async () => {
    if (!record || !(await confirm({ title: `Excluir ${noun}?` }))) return
    try {
      await remove.mutateAsync(record.id)
      toast.success('Registro excluído')
      onClose()
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} variant={variant}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto px-5 py-5">
          {fields.map((f) => {
            if (f.showWhen && !f.showWhen(watch())) return null
            const error = errors[f.name]?.message as string | undefined
            if (f.type === 'image') {
              return <ImageField key={f.name} field={f} value={watch(f.name) ?? ''} error={error} onChange={(v) => setValue(f.name, v, { shouldDirty: true })} />
            }
            const reg = register(f.name, f.mask ? { onChange: (e) => setValue(f.name, f.mask!(e.target.value)) } : undefined)
            const wide = f.full || f.type === 'textarea'
            return (
              <Field key={f.name} label={f.label} error={error} className={wide ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
                {f.type === 'select' ? (
                  <Select {...reg}>
                    {f.emptyOption && <option value="">{f.emptyOption}</option>}
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.type === 'textarea' ? (
                  <Textarea placeholder={f.placeholder} {...reg} />
                ) : (
                  <Input
                    type={f.type === 'datetime' ? 'datetime-local' : f.type ?? 'text'}
                    step={f.type === 'number' ? f.step ?? '0.01' : undefined}
                    placeholder={f.placeholder}
                    {...reg}
                  />
                )}
                {f.hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{f.hint}</span>}
              </Field>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3.5">
          {record && allowDelete ? (
            <Button variant="danger" size="sm" onClick={handleDelete} loading={remove.isPending}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {record ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
