import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { detectarTipoDeLink } from '../../domain/services/DetectorDeTipoDeLink';
import { UrlNoPermitidaError } from '../../domain/errors/UrlNoPermitidaError';
import { ImportarDatasetDesdeUrlUseCase } from '../ports/in/ImportarDatasetDesdeUrlUseCase';
import { SincronizarConApiNvdUseCase } from '../ports/in/SincronizarConApiNvdUseCase';
import { ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';
import { DescargadorDeArchivos } from '../ports/out/DescargadorDeArchivos';
import { LectorExcelDataset } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetConAuditoria } from './auditoria/ImportarDatasetConAuditoria';

// RF nuevo (Sprint 17): "importar desde link" en vez de subir un archivo a
// mano. Orquesta DetectorDeTipoDeLink (clasifica + valida la allowlist) y
// luego, según el tipo:
//  - 'nvd': delega en SincronizarConApiNvd YA existente (Sprint 12) — no se
//    duplica auditoría/notificación/importación, solo se dispara el mismo
//    flujo que ya corre esa lógica.
//  - 'googleSheets' / 'dropbox' / 'directo': descarga con
//    DescargadorDeArchivos (que ya validó IP/tamaño/redirecciones) y sigue
//    el mismo camino que ImportarDatasetDesdeArchivo (Sprint 14): archivo
//    temporal -> LectorExcelDataset -> ImportarDatasetConAuditoria,
//    limpiando el temporal en finally.
export class ImportarDatasetDesdeUrl implements ImportarDatasetDesdeUrlUseCase {
  constructor(
    private readonly descargadorDeArchivos: DescargadorDeArchivos,
    private readonly lectorExcel: LectorExcelDataset,
    private readonly importarDatasetUseCase: ImportarDatasetConAuditoria,
    private readonly sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase
  ) {}

  async ejecutar(url: string, analistaId: string): Promise<ResumenImportacion> {
    const deteccion = detectarTipoDeLink(url);

    if (deteccion.tipo === 'noPermitido') {
      throw new UrlNoPermitidaError(deteccion.motivoRechazo ?? 'URL no permitida');
    }

    if (deteccion.tipo === 'nvd') {
      return this.sincronizarConApiNvdUseCase.ejecutar(analistaId);
    }

    const archivo = await this.descargadorDeArchivos.descargar(deteccion.urlDescargable as string);
    // Preserva la extensión real del archivo descargado (.xlsx/.xls/.csv)
    // para que LectorExcelDataset lo interprete bien; el export de Google
    // Sheets no trae extensión en el path (solo ?format=xlsx), de ahí el
    // default a .xlsx.
    const extension = path.extname(new URL(archivo.urlFinal).pathname) || '.xlsx';
    const rutaTemporal = path.join(os.tmpdir(), `severa-import-url-${randomUUID()}${extension}`);

    try {
      fs.writeFileSync(rutaTemporal, archivo.contenido);
      const resultadoLectura = await this.lectorExcel.leerArchivo(rutaTemporal);
      return await this.importarDatasetUseCase.ejecutar(resultadoLectura, analistaId);
    } finally {
      fs.unlink(rutaTemporal, () => {});
    }
  }
}
