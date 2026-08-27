export interface GenerarInformeUseCase {
  // analistaId: quién lo pidió (siempre del token) — se usa para resolver el
  // nombre que aparece en la portada del informe (ver
  // ResolverNombreAnalistaParaInforme.ts), no solo para auditoría.
  ejecutar(formato: 'pdf' | 'docx', analistaId: string): Promise<Buffer>;
}
