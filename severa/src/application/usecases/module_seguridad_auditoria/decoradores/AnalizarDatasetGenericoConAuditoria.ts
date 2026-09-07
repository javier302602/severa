import { AnalizarDatasetGenericoUseCase, ResultadoAnalisisDataset } from '../../../ports/in/module_carga_gestion_datasets/AnalizarDatasetGenericoUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-94/RNF-49: registra cada importación de dataset genérico. Deliberadamente
// solo auditoría, sin notificación (a diferencia de ImportarDatasetConAuditoria):
// ServicioDeNotificaciones.notificarImportacionCompletada tiene una forma
// {importados, rechazados, criticas} específica del dominio de
// vulnerabilidades ("críticas" no tiene sentido para un dataset genérico) —
// inventar una notificación genérica no estaba pedido en esta ronda, así que
// se documenta como decisión explícita en vez de forzar un mensaje que no
// encaja.
export class AnalizarDatasetGenericoConAuditoria implements AnalizarDatasetGenericoUseCase {
  constructor(
    private readonly usecase: AnalizarDatasetGenericoUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(rutaArchivo: string, analistaId: string, nombreArchivoOriginal: string): Promise<ResultadoAnalisisDataset> {
    const resultado = await this.usecase.ejecutar(rutaArchivo, analistaId, nombreArchivoOriginal);

    const { diagnostico } = resultado;
    const detalle =
      `${diagnostico.totalFilas} fila(s), ${diagnostico.columnas.length} columna(s)` +
      (diagnostico.filasDuplicadas > 0 ? `, ${diagnostico.filasDuplicadas} duplicada(s)` : '') +
      ` (archivo: ${nombreArchivoOriginal})`;

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'ImportarDatasetGenerico',
      detalle
    });

    return resultado;
  }
}
