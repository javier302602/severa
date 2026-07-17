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
    // sincronización con NVD y "importar desde link" no tienen un nombre
    // de archivo real que ofrecer, así que quedan sin ese sufijo.
    nombreArchivoOriginal?: string
  ): Promise<ResumenImportacion> {
    const resumen = await this.usecase.ejecutar(resultado);

    const detalle = `${resumen.importados} importados, ${resumen.rechazados} rechazados`
      + (nombreArchivoOriginal ? ` (archivo: ${nombreArchivoOriginal})` : '');

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'ImportarDataset',
      detalle
    });

    // RF-99: alerta por cada vulnerabilidad crítica (CVSS >= 9.0) que haya
    // entrado en esta importación. Se revisa `resultado.importables` (lo que
    // efectivamente se guardó, ver ImportarDataset.ejecutar), no el resumen,
    // porque el resumen solo trae conteos.
    const criticas = (resultado?.importables ?? []).filter((item) => esVulnerabilidadCritica(item.vulnerabilidad));
    await Promise.all(
      criticas.map((item) => this.servicioDeNotificaciones.notificarVulnerabilidadCritica(item.vulnerabilidad, analistaId))
    );

    return resumen;
  }
}
