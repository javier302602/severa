// RF-14: el historial completo del analista como libro de Excel (.xlsx).
export interface ExportarHistorialAnalisisUseCase {
  ejecutar(analistaId: string): Promise<Buffer>;
}
