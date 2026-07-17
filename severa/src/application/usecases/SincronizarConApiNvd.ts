import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { ImportarDatasetConAuditoria } from './auditoria/ImportarDatasetConAuditoria';
import { SincronizarConApiNvdUseCase } from '../ports/in/SincronizarConApiNvdUseCase';
import { LectorExcelDataset } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { NvdApiClient } from '../ports/out/NvdApiClient';
import { ServicioDeNotificaciones } from '../ports/out/ServicioDeNotificaciones';

export class SincronizarConApiNvd implements SincronizarConApiNvdUseCase {
  constructor(
    private readonly nvdApiClient: NvdApiClient,
    private readonly lectorExcel: LectorExcelDataset,
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

  async ejecutar(analistaId: string): Promise<{ importados: number; rechazados: number; errores: string[] }> {
    const buffer = await this.nvdApiClient.descargarDataset();
    // Nombre único (mismo patrón que DatasetController, Sprint 14): un
    // nombre fijo aquí significaba que dos sincronizaciones concurrentes se
    // pisarían el archivo temporal entre sí (hueco reportado al cerrar RF-17).
    const tempPath = path.join(os.tmpdir(), `severa-nvd-sync-${randomUUID()}.xlsx`);
    fs.writeFileSync(tempPath, buffer);

    try {
      const resultado = await this.lectorExcel.leerArchivo(tempPath);
      const resumen = await this.importarDatasetUseCase.ejecutar(resultado, analistaId);
      await this.servicioDeNotificaciones.notificarActualizacionDisponible(analistaId, resumen);

      return resumen;
    } finally {
      fs.unlink(tempPath, () => {});
    }
  }
}
