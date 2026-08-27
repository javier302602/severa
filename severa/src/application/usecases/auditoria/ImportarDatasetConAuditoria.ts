import { FilaImportable, FilaRechazada } from '../../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetUseCase, ResumenImportacion } from '../../ports/in/ImportarDatasetUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../ports/out/ServicioDeNotificaciones';
import { esVulnerabilidadCritica } from '../../../domain/services/DetectorDeEventosNotificables';

// RF-94: registra quién modificó el dataset y cuándo. No implementa
// ImportarDatasetUseCase porque necesita el analistaId como parámetro extra
// (mismo motivo que MarcarEnProcesoDeRemediacionConAuditoria). NOTA (ver
// resumen de huecos del sprint): ImportarDataset todavía no tiene ninguna
// ruta HTTP que lo invoque, así que este decorador queda listo pero no se
// puede ejercitar de punta a punta hasta que exista ese endpoint (sí se
// ejercita indirectamente vía SincronizarConApiNvd desde Sprint 12).
export class ImportarDatasetConAuditoria {
  constructor(
    private readonly usecase: ImportarDatasetUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(
    resultado: { importables: FilaImportable[]; rechazadas: FilaRechazada[]; errores?: string[] } | undefined,
    analistaId: string,
    // Fase 1 (informe): único lugar donde el nombre real del archivo
    // subido sobrevive más allá de la respuesta HTTP de este import — se
    // embebe en `detalle` (no hay columna propia en registros_auditoria,
    // decisión confirmada para no agregar schema nuevo solo para esto) y
    // solo lo manda la vía "subir archivo" (DatasetController.ts); la
    // sincronización con NVD no tiene un nombre de archivo real que
    // ofrecer, así que queda sin ese sufijo.
    nombreArchivoOriginal?: string,
    // "Importar desde link" (2026-07-17, allowlist de hosts eliminada):
    // SOLO host+path del link real usado, NUNCA la query string completa
    // — las URLs firmadas (Google Cloud Storage, S3, etc.) llevan el token
    // de acceso ahí (ej. X-Goog-Signature) y guardarlo en nuestra propia
    // auditoría sería dejar una credencial temporal persistida sin
    // necesidad. El llamador (ImportarDatasetDesdeUrl) es responsable de
    // despojar la query string ANTES de pasar este valor.
    origenLink?: string
  ): Promise<ResumenImportacion> {
    const resumen = await this.usecase.ejecutar(resultado, analistaId);

    const detalle = `${resumen.importados} importados, ${resumen.rechazados} rechazados`
      + (nombreArchivoOriginal ? ` (archivo: ${nombreArchivoOriginal})` : '')
      + (origenLink ? ` (origen: ${origenLink})` : '');

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'ImportarDataset',
      detalle
    });

    // RF-99 (bug real corregido 2026-07-19): antes se notificaba una vez POR
    // CADA vulnerabilidad crítica (CVSS >= 9.0) — un dataset con muchas
    // críticas inundaba el centro de notificaciones con decenas de alertas
    // idénticas en su forma. Ahora es UNA sola notificación por importación,
    // con el conteo de críticas incluido. Se revisa `resultado.importables`
    // (lo que efectivamente se guardó), no el resumen, porque el resumen
    // solo trae conteos totales.
    const cantidadCriticas = (resultado?.importables ?? []).filter((item) => esVulnerabilidadCritica(item.vulnerabilidad)).length;
    await this.servicioDeNotificaciones.notificarImportacionCompletada(analistaId, {
      importados: resumen.importados,
      rechazados: resumen.rechazados,
      criticas: cantidadCriticas
    });

    return resumen;
  }

  // Streaming (2026-07-17, "importar desde link" con CSV grandes — ver
  // ImportarDatasetDesdeUrl.leerArchivoCsvEnStreaming): ese camino NO pasa
  // por ejecutar() de arriba (no arma un array completo de importables en
  // memoria, así que no puede reutilizar esa firma), pero necesita la MISMA
  // auditoría y la MISMA notificación de resumen. `criticas` lo cuenta el
  // propio streaming sobre la marcha (ImportarDatasetDesdeUrl.ts), porque acá
  // ya no queda ningún array completo de importables para filtrar.
  async registrarImportacionPorLink(resumen: ResumenImportacion, analistaId: string, origenLink: string, criticas: number): Promise<void> {
    const detalle = `${resumen.importados} importados, ${resumen.rechazados} rechazados (origen: ${origenLink})`;
    await this.auditoriaRepository.registrar({ usuario: analistaId, accion: 'ImportarDataset', detalle });
    await this.servicioDeNotificaciones.notificarImportacionCompletada(analistaId, {
      importados: resumen.importados,
      rechazados: resumen.rechazados,
      criticas
    });
  }
}
