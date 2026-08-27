import { SincronizarConApiNvdUseCase } from '../ports/in/SincronizarConApiNvdUseCase';
import { ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';
import { ImportarDatasetConAuditoria } from './auditoria/ImportarDatasetConAuditoria';
import { NvdApiClient } from '../ports/out/NvdApiClient';
import { ServicioDeNotificaciones } from '../ports/out/ServicioDeNotificaciones';

export class SincronizarConApiNvd implements SincronizarConApiNvdUseCase {
  constructor(
    private readonly nvdApiClient: NvdApiClient,
    // RF-94: antes este caso de uso instanciaba su propio `new ImportarDataset(...)`
    // sin envolver, así que una sincronización con NVD cambiaba el dataset sin
    // dejar rastro de auditoría (hueco reportado en M-12). Recibe la versión ya
    // decorada para que quede registrada igual que cualquier otro cambio de dataset.
    // Esa misma llamada dispara, de paso, las alertas RF-99 de vulnerabilidad
    // crítica sobre lo recién sincronizado.
    private readonly importarDatasetUseCase: ImportarDatasetConAuditoria,
    // RF-102 (Sprint 13): notifica que la sincronización con NVD trajo datos nuevos.
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(analistaId: string, url: string): Promise<ResumenImportacion> {
    // NvdApiClient ya devuelve {importables, rechazadas} parseado desde el
    // JSON real de NVD (ver ParseadorRespuestaNvd) — ya no hace falta pasar
    // por un archivo temporal ni por LectorExcelDataset (eso era solo
    // necesario cuando esta clase asumía, incorrectamente, que la API
    // devolvía un .xlsx). url: la URL exacta pegada por el usuario, ya
    // validada por DetectorDeTipoDeLink — nunca una reconstruida acá.
    const resultado = await this.nvdApiClient.descargarDataset(url);
    const resumen = await this.importarDatasetUseCase.ejecutar(resultado, analistaId);
    await this.servicioDeNotificaciones.notificarActualizacionDisponible(analistaId, resumen);

    return resumen;
  }
}
