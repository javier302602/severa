import {
  construirFilasAgrupadasPorSeveridad,
  aCsv,
  agruparPorSeveridad,
  filaDeExportacion,
  ENCABEZADO_EXPORTACION
} from '../../src/domain/services/ExportacionAgrupadaPorSeveridad';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

// Bug real reportado: la descarga era una lista plana sin encabezado ni
// orden ("datos sin estructura para trabajar"), y después "un solo cuadro
// sin separación visual". Se agrupa por severidad (Crítica > Alta > Media >
// Baja), con conteo por bloque y una columna "Revisar" para filas con datos
// incompletos — esta agrupación (agruparPorSeveridad) es la única fuente
// reusada tanto por el CSV (aCsv/construirFilasAgrupadasPorSeveridad) como
// por el .xlsx real con color/fusión (ExportadorExcelAgrupado.ts).
describe('ExportacionAgrupadaPorSeveridad', () => {
  const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
  const alta = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'));
  const baja = new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(2.0), 'Nginx', new TipoAccesoValue('No'));

  describe('agruparPorSeveridad', () => {
    test('agrupa en orden Crítica > Alta > Media > Baja, sin grupos vacíos', () => {
      const grupos = agruparPorSeveridad([baja, critica, alta]);

      expect(grupos.map((g) => g.severidad)).toEqual(['Crítica', 'Alta', 'Baja']);
      expect(grupos[0].vulnerabilidades).toEqual([critica]);
      expect(grupos[2].vulnerabilidades).toEqual([baja]);
    });

    test('sin vulnerabilidades, no hay grupos', () => {
      expect(agruparPorSeveridad([])).toEqual([]);
    });
  });

  // Índices de ENCABEZADO_EXPORTACION (2026-07-20: CVE, CVSS, Severidad,
  // Software, Tipo de Acceso, Fecha, Estado, Revisar) — con nombre en vez de
  // número mágico, para que el orden real de las columnas sea la única
  // fuente de verdad y estos tests no dependan de un índice hardcodeado.
  const INDICE_TIPO_ACCESO = ENCABEZADO_EXPORTACION.indexOf('Tipo de Acceso');
  const INDICE_FECHA = ENCABEZADO_EXPORTACION.indexOf('Fecha');
  const INDICE_REVISAR = ENCABEZADO_EXPORTACION.length - 1;

  describe('filaDeExportacion', () => {
    test('campo opcional faltante (Tipo de Acceso) queda vacío en su columna, marca "Revisar"', () => {
      const sinAcceso = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'OpenSSL');
      const fila = filaDeExportacion(sinAcceso);

      expect(fila).toHaveLength(ENCABEZADO_EXPORTACION.length);
      expect(fila[INDICE_TIPO_ACCESO]).toBe(''); // Tipo de Acceso vacío, columna no se omite
      expect(fila[INDICE_FECHA]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Fecha (fechaCarga), formato ISO corto
      expect(fila[INDICE_REVISAR]).toBe('✓'); // Revisar
    });

    test('sin campos vacíos, "Revisar" queda vacío', () => {
      const fila = filaDeExportacion(critica);
      expect(fila[INDICE_REVISAR]).toBe('');
    });
  });

  describe('construirFilasAgrupadasPorSeveridad (CSV)', () => {
    test('agrupa en orden Crítica > Alta > Baja, con encabezado y separador con conteo por grupo', () => {
      const filas = construirFilasAgrupadasPorSeveridad([baja, critica, alta]);

      expect(filas[0]).toEqual(ENCABEZADO_EXPORTACION);
      expect(filas[1][0]).toBe('SEVERIDAD: CRÍTICA (1)');
      expect(filas[2][0]).toBe('CVE-2021-44228');
      expect(filas[2][2]).toBe('Crítica');
      expect(filas[2][3]).toBe('Apache Log4j');
      expect(filas[2][INDICE_TIPO_ACCESO]).toBe('Remoto');
      expect(filas[2][INDICE_REVISAR]).toBe('');
      expect(filas[3][0]).toBe('SEVERIDAD: ALTA (1)');
      expect(filas[4][2]).toBe('Alta');
      expect(filas[5][0]).toBe('SEVERIDAD: BAJA (1)');
      expect(filas[6][2]).toBe('Baja');
    });

    test('con campos vacíos, agrega la nota de "Datos incompletos" al final', () => {
      const sinAcceso = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'OpenSSL');
      const filas = construirFilasAgrupadasPorSeveridad([sinAcceso]);

      expect(filas[filas.length - 1][0]).toContain('Datos incompletos');
    });

    test('sin campos vacíos, no agrega ninguna nota', () => {
      const filas = construirFilasAgrupadasPorSeveridad([critica]);
      expect(filas[filas.length - 1][0]).not.toContain('Datos incompletos');
    });

    test('sin vulnerabilidades, exporta solo el encabezado', () => {
      const filas = construirFilasAgrupadasPorSeveridad([]);
      expect(filas).toEqual([ENCABEZADO_EXPORTACION]);
    });
  });

  test('aCsv arma una línea por fila separada por comas', () => {
    const csv = aCsv([['CVE', 'CVSS'], ['CVE-2021-44228', '10']]);
    expect(csv).toBe('CVE,CVSS\nCVE-2021-44228,10');
  });
});
