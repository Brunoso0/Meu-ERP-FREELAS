import { createPortal } from 'react-dom'

/**
 * Cópia de um documento só para impressão. Fica direto no <body>, invisível
 * na tela; ao imprimir, o CSS esconde o app inteiro e mostra só ela. Assim o
 * PDF tem exatamente as páginas do documento, sem sobras da tela em volta.
 */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  return createPortal(<div className="pdoc-print-root">{children}</div>, document.body)
}
