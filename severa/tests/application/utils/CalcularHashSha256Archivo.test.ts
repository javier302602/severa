import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { calcularHashSha256Archivo } from '../../../src/application/utils/CalcularHashSha256Archivo';

function crearArchivoTemporal(contenido: Buffer | string): string {
  const rutaArchivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'severa-hash-util-test-')), 'archivo.bin');
  fs.writeFileSync(rutaArchivo, contenido);
  return rutaArchivo;
}

describe('calcularHashSha256Archivo', () => {
  test('devuelve el mismo hash SHA-256 que crypto.createHash sobre el contenido real del archivo', async () => {
    const contenido = 'contenido de prueba para hashear, con acentos: áéíóú';
    const rutaArchivo = crearArchivoTemporal(contenido);
    const hashEsperado = createHash('sha256').update(contenido).digest('hex');

    const hash = await calcularHashSha256Archivo(rutaArchivo);

    expect(hash).toBe(hashEsperado);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('dos archivos con contenido distinto producen hashes distintos', async () => {
    const rutaA = crearArchivoTemporal('contenido A');
    const rutaB = crearArchivoTemporal('contenido B');

    const hashA = await calcularHashSha256Archivo(rutaA);
    const hashB = await calcularHashSha256Archivo(rutaB);

    expect(hashA).not.toBe(hashB);
  });

  test('dos archivos con el mismo contenido byte a byte producen el mismo hash', async () => {
    const contenido = 'exactamente el mismo contenido';
    const rutaA = crearArchivoTemporal(contenido);
    const rutaB = crearArchivoTemporal(contenido);

    const hashA = await calcularHashSha256Archivo(rutaA);
    const hashB = await calcularHashSha256Archivo(rutaB);

    expect(hashA).toBe(hashB);
  });

  test('funciona sobre contenido binario (no solo texto), no solo sobre datasets reales', async () => {
    const contenido = Buffer.from([0x00, 0xff, 0x10, 0x20, 0xaa, 0xbb]);
    const rutaArchivo = crearArchivoTemporal(contenido);
    const hashEsperado = createHash('sha256').update(contenido).digest('hex');

    const hash = await calcularHashSha256Archivo(rutaArchivo);

    expect(hash).toBe(hashEsperado);
  });

  test('un archivo inexistente rechaza la promesa en vez de colgarse', async () => {
    await expect(calcularHashSha256Archivo('/ruta/que/no/existe/archivo.xlsx')).rejects.toThrow();
  });
});
