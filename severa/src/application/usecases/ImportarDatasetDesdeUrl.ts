import fs from 'fs';
import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { detectarTipoDeLink } from '../../domain/services/DetectorDeTipoDeLink';
import { UrlNoPermitidaError } from '../../domain/errors/UrlNoPermitidaError';
import { ImportarDatasetDesdeUrlUseCase } from '../ports/in/ImportarDatasetDesdeUrlUseCase';
import { SincronizarConApiNvdUseCase } from '../ports/in/SincronizarConApiNvdUseCase';
import { ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';
import { DescargadorDeArchivos } from '../ports/out/DescargadorDeArchivos';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import {
  LectorExcelDataset,
  MapeoColumnas,
  FilaRechazada,
  construirExcelDeRechazadas,
  MAX_FILAS_RECHAZADAS_PARA_EXCEL
} from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetConAuditoria } from './auditoria/ImportarDatasetConAuditoria';
import { esVulnerabilidadCritica } from '../../domain/services/DetectorDeEventosNotificables';

// Tamaño de lote del camino streaming (CSV) — mismo criterio que
// ImportarDataset.ts (ver ese archivo para el razonamiento sobre el límite
// de parámetros de Postgres).
const TAMANO_DE_LOTE = 1000;

// RF nuevo (Sprint 17): "importar desde link" en vez de subir un archivo a
// mano. Orquesta DetectorDeTipoDeLink y luego, según el tipo:
//  - 'nvd': delega en SincronizarConApiNvd YA existente (Sprint 12).
//  - 'googleSheets' / 'dropbox' / 'directo': descarga con
//    DescargadorDeArchivos (ya streamea a disco, ver
//    DescargadorDeArchivosHttp.ts) y despacha según el formato real:
//      - .csv: streaming de punta a punta (leerArchivoCsvEnStreaming +
//        guardarLote en lotes de TAMANO_DE_LOTE) — el camino pensado para
//        datasets de cientos de miles de filas.
//      - .xlsx/.xls: sigue cargando el archivo completo en memoria
//        (LectorExcelDataset.leerArchivo — SheetJS no soporta streaming real
//        del formato binario), pero AL MENOS inserta en lotes
//        (ImportarDataset.ejecutar ya lo hace). Ver informe: si hace falta
//        soportar .xlsx de cientos de MB con streaming real, hace falta otra
//        librería (exceljs).
export class ImportarDatasetDesdeUrl implements ImportarDatasetDesdeUrlUseCase {
  constructor(
    private readonly descargadorDeArchivos: DescargadorDeArchivos,
    private readonly lectorExcel: LectorExcelDataset,
    private readonly importarDatasetUseCase: ImportarDatasetConAuditoria,
    private readonly sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase,
    private readonly vulnerabilidadRepository: VulnerabilidadRepository
  ) {}

  async ejecutar(url: string, analistaId: string, mapeoColumnas?: MapeoColumnas): Promise<ResumenImportacion> {
    const deteccion = detectarTipoDeLink(url);

    if (deteccion.tipo === 'noPermitido') {
      throw new UrlNoPermitidaError(deteccion.motivoRechazo ?? 'URL no permitida');
    }

    if (deteccion.tipo === 'nvd') {
      return this.sincronizarConApiNvdUseCase.ejecutar(analistaId, deteccion.urlDescargable as string);
    }

    const archivo = await this.descargadorDeArchivos.descargar(deteccion.urlDescargable as string);

    try {
      // Solo host+path para auditoría (ver ImportarDatasetConAuditoria) —
      // NUNCA la query string: URLs firmadas (Google Cloud Storage, S3,
      // etc.) llevan el token de acceso ahí (ej. X-Goog-Signature) y no debe
      // quedar guardado en nuestra propia base de auditoría.
      const urlFinal = new URL(archivo.urlFinal);
      const origenLink = `${urlFinal.host}${urlFinal.pathname}`;

      // ".csv.gz" ya llega descomprimido (ver DescargadorDeArchivosHttp) —
      // se decide el formato real por el path sin el ".gz" final.
      let pathname = urlFinal.pathname.toLowerCase();
      if (pathname.endsWith('.gz')) {
        pathname = pathname.slice(0, -3);
      }

      if (pathname.endsWith('.csv')) {
        return await this.importarCsvEnStreaming(archivo.rutaArchivo, analistaId, origenLink, mapeoColumnas);
      }

      const resultadoLectura = await this.lectorExcel.leerArchivo(archivo.rutaArchivo, mapeoColumnas);
      return await this.importarDatasetUseCase.ejecutar(resultadoLectura, analistaId, undefined, origenLink);
    } finally {
      fs.unlink(archivo.rutaArchivo, () => {});
    }
  }

  private async importarCsvEnStreaming(
    rutaArchivo: string,
    analistaId: string,
    origenLink: string,
    mapeoColumnas?: MapeoColumnas
  ): Promise<ResumenImportacion> {
    let lote: Vulnerabilidad[] = [];
    let importados = 0;
    let rechazados = 0;
    let criticas = 0;
    // Muestra acotada de FilaRechazada COMPLETAS (no solo el mensaje de
    // error) — mismo cap que usa el camino de archivo/NVD (ver
    // LectorExcelDataset.construirExcelDeRechazadas): un CSV de cientos de
    // miles de filas mal formado podría rechazarlas TODAS, y guardar la fila
    // cruda de cada una reintroduciría un problema de memoria sin límite.
    // `rechazados` (el conteo) SIEMPRE refleja el total real.
    const muestraDeRechazadas: FilaRechazada[] = [];

    await this.lectorExcel.leerArchivoCsvEnStreaming(rutaArchivo, mapeoColumnas, async (fila) => {
      if (fila.tipo === 'rechazada') {
        rechazados++;
        if (muestraDeRechazadas.length < MAX_FILAS_RECHAZADAS_PARA_EXCEL) {
          muestraDeRechazadas.push(fila.dato);
        }
        return;
      }

      const vulnerabilidad = fila.dato.vulnerabilidad.asignarAnalista(analistaId);
      // RF-99 (bug real corregido 2026-07-19): antes esto notificaba una
      // alerta por fila crítica en el momento — ahora solo se cuenta, y se
      // notifica UNA vez al terminar todo el streaming (ver
      // registrarImportacionPorLink, más abajo).
      if (esVulnerabilidadCritica(vulnerabilidad)) {
        criticas++;
      }

      lote.push(vulnerabilidad);
      importados++;
      if (lote.length >= TAMANO_DE_LOTE) {
        await this.vulnerabilidadRepository.guardarLote(lote);
        lote = [];
      }
    });

    if (lote.length > 0) {
      await this.vulnerabilidadRepository.guardarLote(lote);
    }

    const resumen: ResumenImportacion = {
      importados,
      rechazados,
      errores: muestraDeRechazadas.map((r) => r.error),
      excelDescartadosBase64:
        muestraDeRechazadas.length > 0 ? construirExcelDeRechazadas(muestraDeRechazadas).toString('base64') : null
    };
    await this.importarDatasetUseCase.registrarImportacionPorLink(resumen, analistaId, origenLink, criticas);

    return resumen;
  }
}
