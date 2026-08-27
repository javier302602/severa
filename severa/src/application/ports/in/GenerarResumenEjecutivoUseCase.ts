export interface GenerarResumenEjecutivoUseCase {
  // analistaId: mismo motivo que GenerarInformeUseCase — resuelve el nombre
  // que aparece en la portada del resumen.
  ejecutar(analistaId: string): Promise<Buffer>;
}
