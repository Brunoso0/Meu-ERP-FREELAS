import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button, Input } from '@/components/ui/primitives'
import { searchServiceCodes, type ServiceCode } from '@/lib/billing'

/**
 * Busca na tabela de códigos do Asaas (tributação nacional ou NBS), pelo
 * número ou por uma palavra, como a lista do Emissor Nacional.
 */
export function ServiceCodeSearch({ kind = 'national', onPick }: { kind?: 'national' | 'nbs'; onPick: (item: ServiceCode) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ServiceCode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = async () => {
    if (term.trim().length < 2) return
    setLoading(true)
    setError('')
    try {
      setResults((await searchServiceCodes(term.trim(), kind)).data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para buscar agora.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
          placeholder={kind === 'nbs' ? 'Buscar NBS: código ou palavra' : 'Buscar código: número ou palavra (ex.: suporte técnico)'}
          aria-label={kind === 'nbs' ? 'Buscar código NBS' : 'Buscar código de tributação nacional'}
        />
        <Button type="button" variant="secondary" onClick={search} loading={loading} disabled={term.trim().length < 2}>
          <Search className="h-4 w-4" /> Buscar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {results && results.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Nada encontrado. Tente outra palavra ou só o número.</p>}
      {results && results.length > 0 && (
        <ul className="max-h-56 overflow-auto rounded-lg border">
          {results.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                onClick={() => {
                  onPick(item)
                  setResults(null)
                  setTerm('')
                }}
                className="block w-full border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="tabular font-semibold">{item.code}</span>
                <span className="text-slate-600 dark:text-slate-300"> · {item.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
