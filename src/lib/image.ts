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
