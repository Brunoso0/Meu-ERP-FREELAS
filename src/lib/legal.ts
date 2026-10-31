/*
 * Dados de quem responde pelo serviço nos Termos e na Política de Privacidade.
 * ATENÇÃO: dados FICTÍCIOS até a empresa e o domínio existirem. Troque antes de divulgar de verdade;
 * se ficarem null, os textos mostram o canal de contato do app.
 */
export const LEGAL = {
  product: 'Krono',
  /** Razão social ou nome de quem opera o serviço (controlador). */
  legalName: 'Krono Tecnologia Ltda. (dados fictícios)' as string | null,
  /** CNPJ (ou CPF) de quem opera o serviço. */
  document: 'CNPJ 00.000.000/0001-00' as string | null,
  /** E-mail para pedidos de privacidade e suporte. */
  contactEmail: 'contato@krono.example' as string | null,
  /** Data da última revisão dos textos. */
  updatedAt: '30 de outubro de 2026',
}

export const TERMS_VERSION = '2026-10-30'
