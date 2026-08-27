import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { ConvertirUrlAExcel } from '../../src/application/usecases/ConvertirUrlAExcel';
import type { DescargadorDeArchivos } from '../../src/application/ports/out/DescargadorDeArchivos';
import type { NvdApiClient } from '../../src/application/ports/out/NvdApiClient';
import { UrlNoPermitidaError } from '../../src/domain/errors/UrlNoPermitidaError';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

// DescargadorDeArchivos ahora entrega un archivo en disco (streaming, ver
// DescargadorDeArchivosHttp.ts), no un Buffer en memoria — estos tests
// escriben un archivo real de prueba y lo referencian por ruta, igual que lo
// haría la implementación real.
function archivoDePrueba(contenido: string | Buffer): string {
  const ruta = path.join(os.tmpdir(), `test-convertir-${randomUUID()}`);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

describe('ConvertirUrlAExcel', () => {
  test('un link de NVD delega en NvdApiClient.descargarDataset() y arma un .xlsx real con las vulnerabilidades, sin pasar por el descargador de archivos', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue({
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
            fuente: 'nvd-api'
          }
        ],
        rechazadas: []
      })
    };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    const urlPegada = 'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2024-01-01T00:00:00.000&pubEndDate=2024-04-30T00:00:00.000';
    const resultado = await usecase.ejecutar(urlPegada);

    expect(resultado.formato).toBe('xlsx');
    const libro = XLSX.read(resultado.buffer, { type: 'buffer' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja);
    expect(filas).toEqual([
      { CVE: 'CVE-2021-44228', Software: 'Apache Log4j', 'CVSS Score': 10, 'Acceso Remoto': 'Sí', 'Tipo Vulnerabilidad': 'N/A' }
    ]);
    // Bug real (2026-07-17): antes se llamaba sin argumentos, ignorando la
    // URL/query params reales que el usuario pegó.
    expect(nvdApiClient.descargarDataset).toHaveBeenCalledWith(urlPegada);
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
  });

  test('un link que ya es .xlsx se devuelve tal cual, sin reescribirlo', async () => {
    const contenidoOriginal = Buffer.from('bytes-xlsx-originales');
    const rutaArchivo = archivoDePrueba(contenidoOriginal);
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        urlFinal: 'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
      })
    };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    const resultado = await usecase.ejecutar('https://docs.google.com/spreadsheets/d/ID123/edit');

    expect(resultado.formato).toBe('xlsx');
    expect(resultado.buffer).toEqual(contenidoOriginal);
    expect(descargadorDeArchivos.descargar).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
    );
    // El archivo temporal se borra después de usarlo.
    expect(fs.existsSync(rutaArchivo)).toBe(false);
  });

  test('un link que descarga CSV se convierte a un .xlsx real y legible', async () => {
    const csv = 'CVE,CVSS Score\nCVE-2024-00001,9.8\nCVE-2024-00002,5.4\n';
    const rutaArchivo = archivoDePrueba(csv);
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo,
        contentType: 'text/csv',
        urlFinal: 'https://www.dropbox.com/s/abc/dataset.csv?dl=1'
      })
    };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    const resultado = await usecase.ejecutar('https://www.dropbox.com/s/abc/dataset.csv?dl=0');

    expect(resultado.formato).toBe('xlsx');
    // El resultado debe ser un .xlsx real: se puede releer con la misma
    // librería y recuperar las mismas filas del CSV original.
    const libro = XLSX.read(resultado.buffer, { type: 'buffer' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja);
    expect(filas).toEqual([
      { CVE: 'CVE-2024-00001', 'CVSS Score': 9.8 },
      { CVE: 'CVE-2024-00002', 'CVSS Score': 5.4 }
    ]);
  });

  test('una URL con esquema no-https se sigue rechazando (esto NO cambió con la eliminación de la allowlist)', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    await expect(usecase.ejecutar('http://storage.googleapis.com/bucket/dataset.csv')).rejects.toThrow(UrlNoPermitidaError);
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
    expect(nvdApiClient.descargarDataset).not.toHaveBeenCalled();
  });

  // Cambio de diseño (2026-07-17): la allowlist de hosts específicos se
  // eliminó como filtro de entrada — un host que antes era rechazado acá
  // ahora SÍ llega al descargador, con su query string (firma incluida)
  // intacta. La protección real contra SSRF es DescargadorDeArchivosHttp.
  test('un host que antes NO estaba en ninguna allowlist ahora SÍ se pasa al descargador, con la query string (firma) intacta', async () => {
    const urlFirmada = 'https://storage.googleapis.com/bucket/dataset.csv?X-Goog-Signature=abc123';
    const rutaArchivo = archivoDePrueba('CVE,CVSS Score\nCVE-2024-00001,9.8\n');
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo,
        contentType: 'text/csv',
        urlFinal: urlFirmada
      })
    };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    await usecase.ejecutar(urlFirmada);

    expect(descargadorDeArchivos.descargar).toHaveBeenCalledWith(urlFirmada);
  });

  test('un CSV con pocas filas (bien por debajo del límite) se convierte normalmente a .xlsx', async () => {
    const filas = Array.from({ length: 100 }, (_, i) => `CVE-2024-${10000 + i},7.8`).join('\n');
    const rutaArchivo = archivoDePrueba(`CVE,CVSS Score\n${filas}\n`);
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo,
        contentType: 'text/csv',
        urlFinal: 'https://ejemplo.example.com/dataset-chico.csv'
      })
    };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    const resultado = await usecase.ejecutar('https://ejemplo.example.com/dataset-chico.csv');

    expect(resultado.formato).toBe('xlsx');
    expect(resultado.buffer).toBeInstanceOf(Buffer);
  });

  // Bug real (2026-07-18): un CSV de ~343.000 filas reventaba el heap de V8
  // completo (XLSX.read cargaba todo el texto y armaba un objeto por celda)
  // — el proceso entero crasheaba, el contenedor se reiniciaba solo, y la
  // conexión se cortaba a mitad de respuesta ("Failed to fetch" del lado del
  // navegador). Fix (2026-07-19, tras medir memoria real): en vez de
  // rechazar, un archivo que excede el límite seguro de conversión a .xlsx
  // se sirve como el CSV original tal cual — sigue siendo el dataset
  // completo, solo que sin pasar por SheetJS.
  test('un CSV con más de 100.000 filas NO se rechaza — se devuelve el CSV crudo tal cual (formato "csv"), sin construir el workbook completo', async () => {
    const filas = Array.from({ length: 100_001 }, (_, i) => `CVE-2024-${100000 + i},7.8`).join('\n');
    const contenidoOriginal = `CVE,CVSS Score\n${filas}\n`;
    const rutaArchivo = archivoDePrueba(contenidoOriginal);
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo,
        contentType: 'text/csv',
        urlFinal: 'https://ejemplo.example.com/dataset-enorme.csv'
      })
    };
    const nvdApiClient: NvdApiClient = { descargarDataset: jest.fn() };
    const usecase = new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient);

    const resultado = await usecase.ejecutar('https://ejemplo.example.com/dataset-enorme.csv');

    expect(resultado.formato).toBe('csv');
    expect(resultado.buffer.toString('utf-8')).toBe(contenidoOriginal);
  }, 15_000);
});
