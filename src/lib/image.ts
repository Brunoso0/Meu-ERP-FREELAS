const ACCEPTED = /^image\/(png|jpe?g|webp)$/

/**
 * Lê uma imagem escolhida pelo usuário e devolve um data URL PNG reduzido.
 *
 * Redesenhar num canvas faz duas coisas: limita o tamanho (a imagem vai
 * dentro do próprio registro, não num arquivo à parte) e garante que o
 * resultado é mesmo uma imagem, qualquer que seja o arquivo enviado.
 */
export async function imageToDataUrl(file: File, maxSize = 480): Promise<string> {
  if (!ACCEPTED.test(file.type)) throw new Error('Envie uma imagem PNG, JPG ou WEBP.')
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem pode ter até 5 MB.')

  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem.'))
    }
    img.src = url
  })

  const scale = Math.min(1, maxSize / Math.max(source.naturalWidth, source.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem.')
  // fundo branco: QR com transparência ficaria ilegível sobre fundo escuro
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // redução suavizada preserva a geometria do QR Code (conferido: decodifica igual ao original)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/**
 * Recorta o canvas na área que tem tinta e devolve o PNG (data URL), com uma
 * pequena margem. Assim a assinatura ocupa a imagem inteira e não sai miúda
 * no documento. Devolve null se o canvas estiver em branco.
 */
export function cropInk(canvas: HTMLCanvasElement, margin = 8): string | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const x0 = Math.max(0, minX - margin)
  const y0 = Math.max(0, minY - margin)
  const w = Math.min(width, maxX + margin + 1) - x0
  const h = Math.min(height, maxY + margin + 1) - y0
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')?.drawImage(canvas, x0, y0, w, h, 0, 0, w, h)
  return out.toDataURL('image/png')
}

/**
 * Transforma a foto ou o scan de uma assinatura em papel numa assinatura
 * "limpa": o papel vira transparente e o traço fica escuro, recortado na
 * área assinada. O resultado é um PNG pequeno, pronto para ir no documento.
 */
export async function signatureFromImage(file: File): Promise<string> {
  if (!ACCEPTED.test(file.type)) throw new Error('Envie uma imagem PNG, JPG ou WEBP.')
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem pode ter até 5 MB.')

  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem.'))
    }
    img.src = url
  })

  const scale = Math.min(1, 640 / Math.max(source.naturalWidth, source.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  // quanto mais escuro o ponto, mais opaca a tinta; o papel (claro) some
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    const luminance = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    const ink = Math.max(0, Math.min(1, (170 - luminance) / 90))
    px[i] = 15
    px[i + 1] = 23
    px[i + 2] = 42
    px[i + 3] = Math.round(ink * 255)
  }
  ctx.putImageData(image, 0, 0)

  const cropped = cropInk(canvas)
  if (!cropped) throw new Error('Não encontrei um traço escuro na imagem. Use uma foto nítida da assinatura em papel branco.')
  if (cropped.length > 200000) throw new Error('A imagem ficou grande demais. Recorte a foto só na assinatura e tente de novo.')
  return cropped
}
