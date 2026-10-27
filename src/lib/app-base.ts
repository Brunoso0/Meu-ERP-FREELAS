/** O sistema mora em /app; a raiz do domínio é a landing page (index.html na raiz do projeto). */
export const APP_BASE = '/app'

/** Endereço completo de uma tela do sistema, para links enviados por fora (convite, assinatura). */
export const appUrl = (path: string) => `${window.location.origin}${APP_BASE}${path}`
