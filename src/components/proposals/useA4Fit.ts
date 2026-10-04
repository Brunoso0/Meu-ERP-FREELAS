import { useEffect, useRef, useState } from 'react'

const A4_WIDTH_PX = 794 // 210mm a 96dpi

/**
 * Os documentos (proposta, orçamento) têm a largura real de uma folha A4.
 * Este hook devolve o zoom que os faz caber no espaço disponível na tela;
 * na impressão o CSS volta ao tamanho real.
 */
export function useA4Fit() {
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = frame.current
    if (!el) return
    // sem largura (cópia fora da tela, usada só para imprimir) fica no tamanho real
    const fit = () => setZoom(el.clientWidth > 0 ? Math.min(1, el.clientWidth / A4_WIDTH_PX) : 1)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { frame, zoom }
}
