import fs from 'fs';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse';
import { detectarTipoDeLink } from '../../domain/services/DetectorDeTipoDeLink';
import { UrlNoPermitidaError } from '../../domain/errors/UrlNoPermitidaError';
import { DescargadorDeArchivos, ArchivoDescargado } from '../ports/out/DescargadorDeArchivos';
import { NvdApiClient } from '../ports/out/NvdApiClient';
import { FilaImportable } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';

// Sección Informes: "convertir link a Excel" — a diferencia de
// ImportarDatasetDesdeUrl.ts (que persiste el resultado en la base de datos
// como catálogo de vulnerabilidades), esto es una conversión/exportación
// independiente: el resultado es un archivo descargable, sin tocar la base
// de datos ni el historial de auditoría de importaciones. Reutiliza
// EXACTAMENTE los mismos dos puntos de seguridad ya construidos para
// "importar desde link" (DetectorDeTipoDeLink; DescargadorDeArchivos:
// resolución de IP/redirecciones/tamaño/streaming) — no duplica esa lógica.
const EXTENSIONES_EXCEL = ['.xlsx', '.xls'];
const CONTENT_TYPES_EXCEL = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

// Bug real (2026-07-18): con el CSV real de Kaggle (~343.000 filas), esta
// conversión hacía `fs.readFileSync(...)` + `XLSX.read(csv, {type:'string'})`
// — SheetJS arma un objeto por celda en memoria, y el heap de V8 llegó a
// ~900MB y crasheó TODO el proceso ("JavaScript heap out of memory"). El
// contenedor se reiniciaba solo y cortaba la conexión a mitad de respuesta
// — eso es el "Failed to fetch" que veía el navegador.
//
// Medido en vivo (2026-07-19) con 17 columnas (como el dataset real):
// 100.000 filas = ~199MB/5s (seguro); 300.000 filas = ~903MB/19s (al límite
// del contenedor de 1.5GB); 500.000 filas = crash directo de SheetJS
// ("Too many properties to enumerate", un límite interno de la librería, no
// solo de memoria) — confirma que "subir el límite" sin más no escala.
//
// Fix de fondo (no solo subir el número): para un archivo que SÍ excede el
// límite seguro, en vez de rechazar la conversión, se sirve el CSV original
// tal cual (ya es un archivo tabular real y completo, abre en Excel igual)
// — evita pasar por SheetJS del todo para el caso justamente más grande,
// que es cuando más importa no arriesgar un crash. "Importar" (que sí
// procesa cualquier tamaño en streaming real, sin este límite) sigue siendo
// el camino correcto para llevar el dataset completo al catálogo.
const LIMITE_FILAS_CONVERSION_XLSX = 100_000;

export interface ResultadoConversion {
  buffer: Buffer;
  formato: 'xlsx' | 'csv';
}

function yaEsExcel(archivo: ArchivoDescargado): boolean {
  const path = new URL(archivo.urlFinal).pathname.toLowerCase();
  if (EXTENSIONES_EXCEL.some((extension) => path.endsWith(extension))) {
    return true;
  }
  const tipoBase = archivo.contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
  return tipoBase !== null && CONTENT_TYPES_EXCEL.includes(tipoBase);
}

// El CSV se lee en streaming (mismo patrón/librería que
// LectorExcelDataset.leerArchivoCsvEnStreaming) para no cargar el texto
// completo en memoria de una sola vez. Si supera LIMITE_FILAS_CONVERSION_XLSX,
// se corta la lectura ahí mismo (nunca se termina de acumular el archivo
// entero en el array `filas`) y se devuelve el CSV crudo tal cual, sin pasar
// por SheetJS.
function convertirCsvEnStreaming(rutaArchivo: string): Promise<ResultadoConversion> {
  return new Promise((resolve, reject) => {
    // cast:true (a diferencia de LectorExcelDataset, que siempre trabaja con
    // los strings crudos porque cada Value Object hace su propia conversión)
    // — acá no hay validación de dominio de por medio, así que se necesita
    // para no perder el tipo numérico que SheetJS sí auto-detectaba antes.
    const parser = fs
      .createReadStream(rutaArchivo)
      .pipe(parse({ columns: false, skip_empty_lines: true, trim: true, bom: true, cast: true }));
    const filas: string[][] = [];
    let resuelto = false;

    parser.on('data', (fila: string[]) => {
      if (resuelto) {
        return;
      }
      filas.push(fila);
      if (filas.length > LIMITE_FILAS_CONVERSION_XLSX) {
        resuelto = true;
        filas.length = 0; // libera lo acumulado — ya no se usa, cae al CSV crudo
        parser.destroy();
        resolve({ buffer: fs.readFileSync(rutaArchivo), formato: 'csv' });
      }
    });

    parser.on('end', () => {
      if (resuelto) {
        return;
      }
      try {
        const hoja = XLSX.utils.aoa_to_sheet(filas);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
        resolve({ buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer, formato: 'xlsx' });
      } catch (error) {
        reject(error);
      }
    });

    parser.on('error', (error) => {
      if (!resuelto) {
        reject(error);
      }
    });
  });
}

async function convertirSiHaceFalta(archivo: ArchivoDescargado): Promise<ResultadoConversion> {
  if (yaEsExcel(archivo)) {
    return { buffer: fs.readFileSync(archivo.rutaArchivo), formato: 'xlsx' };
  }

  return convertirCsvEnStreaming(archivo.rutaArchivo);
}

// NvdApiClient.descargarDataset() ya devuelve Vulnerabilidad[] parseadas (ver
// ParseadorRespuestaNvd.ts), no un buffer — acá se reescriben a filas con las
// mismas columnas que espera LectorExcelDataset (COLUMNA_POR_DEFECTO/alias),
// para que el .xlsx resultante también se pueda reimportar sin errores.
function importablesAXlsx(importables: FilaImportable[]): Buffer {
  const filas = importables.map(({ vulnerabilidad }) => ({
    CVE: vulnerabilidad.cve.valor,
    Software: vulnerabilidad.software,
    'CVSS Score': vulnerabilidad.cvssScore.valor,
    'Acceso Remoto': vulnerabilidad.tipoAcceso?.valor === 'Remoto' ? 'Sí' : 'No',
    'Tipo Vulnerabilidad': vulnerabilidad.tipoVulnerabilidad
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'NVD');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export class ConvertirUrlAExcel {
  constructor(
    private readonly descargadorDeArchivos: DescargadorDeArchivos,
    private readonly nvdApiClient: NvdApiClient
  ) {}

  async ejecutar(url: string): Promise<ResultadoConversion> {
    const deteccion = detectarTipoDeLink(url);

    if (deteccion.tipo === 'noPermitido') {
      throw new UrlNoPermitidaError(deteccion.motivoRechazo ?? 'URL no permitida');
    }

    if (deteccion.tipo === 'nvd') {
      // Mismo dataset que ya arma SincronizarConApiNvd — acá simplemente no
      // se importa a la base de datos, se convierte a .xlsx para descargar.
      // deteccion.urlDescargable es la URL real pegada (ya validada), nunca
      // una reconstruida internamente.
      const { importables } = await this.nvdApiClient.descargarDataset(deteccion.urlDescargable as string);
      return { buffer: importablesAXlsx(importables), formato: 'xlsx' };
    }

    const archivo = await this.descargadorDeArchivos.descargar(deteccion.urlDescargable as string);
    try {
      return await convertirSiHaceFalta(archivo);
    } finally {
      fs.unlink(archivo.rutaArchivo, () => {});
    }
  }
}
