import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

const WIDTH = 600
const HEIGHT = 200

/**
 * Área para desenhar a assinatura com o dedo, a caneta ou o mouse. Avisa o
 * pai com o PNG (data URL) a cada traço, ou com null quando está em branco.
 */
export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  // o canvas tem tamanho fixo e é esticado pelo CSS: converte a posição do ponteiro
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // um toque sem arrastar também deixa marca
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current || !canvas.current) return
    drawing.current = false
    setEmpty(false)
    onChange(canvas.current.toDataURL('image/png'))
  }

  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-lg border bg-white">
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label="Área para desenhar a assinatura"
          className="block h-40 w-full cursor-crosshair touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Assine aqui, com o dedo ou o mouse</p>}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-slate-300" />
      </div>
      <div className="mt-1.5 flex justify-end">
        <Button variant="ghost" size="sm" onClick={clear} disabled={empty}>
          <Eraser className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>
    </div>
  )
}
