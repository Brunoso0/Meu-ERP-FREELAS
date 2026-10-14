import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Eraser, Maximize2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cropInk } from '@/lib/image'
import { cn } from '@/lib/utils'

const INK = '#0f172a'

/**
 * Quadro de desenho. O canvas acompanha o tamanho que ocupa na tela (com a
 * densidade do aparelho), então o traço não sai esticado nem serrilhado.
 * `rotated` indica que o quadro está girado 90° pelo CSS (celular em pé).
 */
function useInk({ rotated, lineWidth, onStroke }: { rotated: boolean; lineWidth: number; onStroke: (png: string | null) => void }) {
  // em estado, não só em ref: dentro de um diálogo o canvas só existe depois da primeira renderização
  const [el, setEl] = useState<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    if (!el) return
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(el.offsetWidth * ratio))
      const height = Math.max(1, Math.round(el.offsetHeight * ratio))
      if (el.width === width && el.height === height) return
      // mudar o tamanho apaga o canvas: guarda o que já foi desenhado e redesenha
      const keep = document.createElement('canvas')
      keep.width = el.width
      keep.height = el.height
      keep.getContext('2d')?.drawImage(el, 0, 0)
      el.width = width
      el.height = height
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.drawImage(keep, 0, 0, keep.width, keep.height, 0, 0, width, height)
      ctx.lineWidth = lineWidth * ratio
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK
    }
    // o canvas nasce com 300×150 em branco: nada a preservar na primeira medida
    el.width = 1
    el.height = 1
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, lineWidth])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    // girado 90° no sentido horário: o eixo X do quadro desce pela tela
    if (rotated) return { x: ((e.clientY - rect.top) / rect.height) * el.width, y: ((rect.right - e.clientX) / rect.width) * el.height }
    return { x: ((e.clientX - rect.left) / rect.width) * el.width, y: ((e.clientY - rect.top) / rect.height) * el.height }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = el?.getContext('2d')
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
    const ctx = el?.getContext('2d')
    if (!ctx) return
    const { x, y } = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current || !el) return
    drawing.current = false
    setEmpty(false)
    // recortada no traço: a assinatura ocupa a imagem toda e não sai miúda no documento
    onStroke(cropInk(el))
  }

  const clear = () => {
    el?.getContext('2d')?.clearRect(0, 0, el.width, el.height)
    setEmpty(true)
    onStroke(null)
  }

  const handlers = { onPointerDown: start, onPointerMove: move, onPointerUp: end, onPointerCancel: end, onPointerLeave: end }
  return { canvas: setEl, empty, clear, handlers }
}

/** Tenta pôr o aparelho em tela cheia e deitado. Onde o navegador não deixa (iPhone), o quadro é girado pelo CSS. */
async function enterLandscape() {
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape')
  } catch {
    // sem permissão ou sem suporte: segue com o quadro girado
  }
}

function leaveLandscape() {
  try {
    screen.orientation?.unlock?.()
    if (document.fullscreenElement) void document.exitFullscreen()
  } catch {
    // nada a desfazer
  }
}

/** Quadro em tela cheia e na horizontal, para assinar com o dedo com o máximo de área. */
function FullscreenPad({ onDone, onCancel }: { onDone: (png: string) => void; onCancel: () => void }) {
  const portrait = useMediaQuery('(orientation: portrait)')
  const [draft, setDraft] = useState<string | null>(null)
  const { canvas, empty, clear, handlers } = useInk({ rotated: portrait, lineWidth: 3.5, onStroke: setDraft })

  useEffect(() => {
    void enterLandscape()
    return leaveLandscape
  }, [])

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-[60] overflow-hidden bg-slate-100 text-slate-900 focus:outline-none"
        >
          <div className={cn('flex flex-col gap-2 p-3', portrait ? 'sign-stage-rotated' : 'absolute inset-0')} style={portrait ? undefined : { paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}>
            <div className="flex shrink-0 items-center gap-2">
              <Dialog.Title className="mr-auto flex min-w-0 items-center gap-2 text-sm font-semibold">
                {portrait && <RotateCw className="h-4 w-4 shrink-0 text-slate-500" />}
                <span className="truncate">{portrait ? 'Vire o aparelho e assine' : 'Assine no quadro'}</span>
              </Dialog.Title>
              <Button variant="ghost" className="text-slate-600 hover:bg-slate-200 dark:text-slate-600 dark:hover:bg-slate-200" onClick={onCancel}>
                Cancelar
              </Button>
              <Button variant="secondary" className="bg-white text-slate-700 hover:bg-slate-50 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-50" onClick={clear} disabled={empty}>
                <Eraser className="h-4 w-4" /> Limpar
              </Button>
              <Button disabled={!draft} onClick={() => draft && onDone(draft)}>
                <Check className="h-4 w-4" /> Concluir
              </Button>
            </div>
            <div className="relative min-h-0 flex-1 rounded-xl border border-slate-300 bg-white">
              <canvas ref={canvas} aria-label="Área para desenhar a assinatura" className="absolute inset-0 h-full w-full touch-none rounded-xl" {...handlers} />
              {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Assine aqui com o dedo</p>}
              <div className="pointer-events-none absolute inset-x-8 bottom-[22%] border-b border-dashed border-slate-300" />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Área para desenhar a assinatura. No computador o quadro fica na própria
 * página; em telas de toque abre em tela cheia e deitado, que dá muito mais
 * espaço para o dedo. Avisa o pai com o PNG (data URL), ou null se em branco.
 */
export function SignaturePad({ onChange, autoOpen = false }: { onChange: (png: string | null) => void; autoOpen?: boolean }) {
  // toque ou tela de celular: o quadro na página ficaria pequeno demais para o dedo
  // Decidido uma vez só: deitar o aparelho no meio da assinatura não pode trocar de quadro.
  const [touch] = useState(() => window.matchMedia('(pointer: coarse), (max-width: 767px)').matches)
  return touch ? <TouchPad onChange={onChange} autoOpen={autoOpen} /> : <InlinePad onChange={onChange} />
}

function TouchPad({ onChange, autoOpen }: { onChange: (png: string | null) => void; autoOpen: boolean }) {
  const [full, setFull] = useState(autoOpen)
  const [value, setValue] = useState<string | null>(null)
  const change = useCallback(
    (png: string | null) => {
      setValue(png)
      onChange(png)
    },
    [onChange],
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => setFull(true)}
        aria-label={value ? 'Refazer a assinatura em tela cheia' : 'Assinar em tela cheia'}
        className="relative flex h-40 w-full items-center justify-center rounded-lg border bg-white p-3"
      >
        {value ? (
          <img src={value} alt="Assinatura desenhada" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-slate-500">
            <Maximize2 className="h-5 w-5" />
            Toque para assinar em tela cheia
          </span>
        )}
      </button>
      <div className="mt-1.5 flex justify-end gap-1">
        {value && (
          <Button variant="ghost" size="sm" onClick={() => setFull(true)}>
            Refazer
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => change(null)} disabled={!value}>
          <Eraser className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>
      {full && (
        <FullscreenPad
          onCancel={() => setFull(false)}
          onDone={(png) => {
            change(png)
            setFull(false)
          }}
        />
      )}
    </div>
  )
}

function InlinePad({ onChange }: { onChange: (png: string | null) => void }) {
  const { canvas, empty, clear, handlers } = useInk({ rotated: false, lineWidth: 2.5, onStroke: onChange })

  return (
    <div>
      <div className="relative rounded-lg border bg-white">
        <canvas ref={canvas} aria-label="Área para desenhar a assinatura" className="block h-40 w-full cursor-crosshair touch-none rounded-lg" {...handlers} />
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
