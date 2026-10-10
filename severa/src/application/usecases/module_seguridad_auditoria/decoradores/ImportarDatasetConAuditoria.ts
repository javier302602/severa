import { FilaImportable, FilaRechazada } from '../../../../infrastructure/adapters/out/dataset/parsers/LectorExcelDataset';
import { ImportarDatasetUseCase, ResumenImportacion } from '../../../ports/in/module_carga_gestion_datasets/ImportarDatasetUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { AnalistaRepository } from '../../../ports/out/persistencia/repositorios/AnalistaRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';
import { CriterioDeCriticas, criterioDeCriticas, esVulnerabilidadCritica } from '../../../../domain/services/DetectorDeEventosNotificables';
import { EscalaDeClasificacionRepository } from '../../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { escalaVigente } from '../../module_priorizacion_clasificacion/EscalaDeClasificacion';

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
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones,
    // RF-99 (M-13, retoma): UNA sola consulta por importación (no por fila)
    // para resolver el umbral crítico configurado por el analista — ver el
    // uso más abajo, antes del .filter().
    private readonly analistaRepository: AnalistaRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  // RF-99 + RF-28/RF-69: qué cuenta como crítica para este analista (el corte
  // de Crítico de su escala, o su umbral propio). Lo usan las dos formas de
  // importar, para que la regla sea la misma.
  async criterioDeCriticas(analistaId: string): Promise<CriterioDeCriticas> {
    const umbralPropio = await this.analistaRepository.obtenerUmbralCritico(analistaId);
    const { escala } = await escalaVigente(this.escalaRepository, analistaId);
    return criterioDeCriticas(umbralPropio, escala);
  }

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
    const criterio = await this.criterioDeCriticas(analistaId);
    const cantidadCriticas = (resultado?.importables ?? []).filter((item) => esVulnerabilidadCritica(item.vulnerabilidad, criterio.umbral)).length;
    await this.servicioDeNotificaciones.notificarImportacionCompletada(analistaId, {
      importados: resumen.importados,
      rechazados: resumen.rechazados,
      criticas: cantidadCriticas,
      criterioDeCriticas: criterio.descripcion
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
  async registrarImportacionPorLink(
    resumen: ResumenImportacion,
    analistaId: string,
    origenLink: string,
    criticas: number,
    criterio: CriterioDeCriticas
  ): Promise<void> {
    const detalle = `${resumen.importados} importados, ${resumen.rechazados} rechazados (origen: ${origenLink})`;
    await this.auditoriaRepository.registrar({ usuario: analistaId, accion: 'ImportarDataset', detalle });
    await this.servicioDeNotificaciones.notificarImportacionCompletada(analistaId, {
      importados: resumen.importados,
      rechazados: resumen.rechazados,
      criticas,
      criterioDeCriticas: criterio.descripcion
    });
  }
}
