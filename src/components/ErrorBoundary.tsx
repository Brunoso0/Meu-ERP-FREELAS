import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/errors'

/** Se uma tela quebrar ao desenhar, a pessoa vê um aviso e um botão, não uma página em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = (info.componentStack ?? '').split('\n').map((l) => l.trim().replace(/^at /, '').replace(/ \(.*\)$/, '')).filter(Boolean)
    reportError(error, { kind: 'tela', where: `tela quebrou em ${stack[0] ?? '?'}`, extra: { componentes: stack.slice(0, 8).join(' < ') } })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <h1 className="text-lg font-semibold">Algo deu errado por aqui</h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">Já registramos o problema. Recarregue a página para continuar; seus dados estão salvos.</p>
        <button type="button" onClick={() => location.reload()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Recarregar
        </button>
      </div>
    )
  }
}
