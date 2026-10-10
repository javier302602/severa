import {
  construirFilasAgrupadasPorNivelDeRiesgo,
  aCsv,
  agruparPorNivelDeRiesgo,
  filaDeExportacion,
  lineaDeEscala,
  ENCABEZADO_EXPORTACION
} from '../../../src/domain/services/ExportacionAgrupadaPorNivelDeRiesgo';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';

// Bug real reportado: la descarga era una lista plana sin encabezado ni
// orden ("datos sin estructura para trabajar"), y después "un solo cuadro
// sin separación visual". Se agrupa por nivel de riesgo (Crítico > Alto >
// Moderado > Bajo), con conteo por bloque y una columna "Revisar" para filas
// con datos incompletos — esta agrupación es la única fuente reusada tanto por
// el CSV como por el .xlsx real con color/fusión (ExportadorExcelAgrupado.ts).
//
// RF-28 / RF-69 (Modo B): el nivel sale de la escala del analista, y el
// archivo dice cuál fue.
describe('ExportacionAgrupadaPorNivelDeRiesgo', () => {
  const CVSS = EscalaDeClasificacion.CVSS;
  const PROPIA = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 });

  const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
  const alta = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'));
  const ochoSiete = new Vulnerabilidad('5', new IdentificadorCVE('CVE-2021-08700'), new CvssScore(8.7), 'Router', new TipoAccesoValue('Sí'));
  const baja = new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(2.0), 'Nginx', new TipoAccesoValue('No'));

  describe('agruparPorNivelDeRiesgo', () => {
    test('agrupa en orden Crítico > Alto > Moderado > Bajo, sin grupos vacíos', () => {
      const grupos = agruparPorNivelDeRiesgo([baja, critica, alta], CVSS);

      expect(grupos.map((g) => g.nivel)).toEqual(['Crítico', 'Alto', 'Bajo']);
      expect(grupos[0].vulnerabilidades).toEqual([critica]);
      expect(grupos[2].vulnerabilidades).toEqual([baja]);
    });

    test('con "Crítico desde 8.5", un 8.7 pasa de Alto a Crítico', () => {
      expect(agruparPorNivelDeRiesgo([ochoSiete], CVSS).map((g) => g.nivel)).toEqual(['Alto']);
      expect(agruparPorNivelDeRiesgo([ochoSiete], PROPIA).map((g) => g.nivel)).toEqual(['Crítico']);
    });

    test('sin vulnerabilidades, no hay grupos', () => {
      expect(agruparPorNivelDeRiesgo([], CVSS)).toEqual([]);
    });
  });

  const INDICE_NIVEL = ENCABEZADO_EXPORTACION.indexOf('Nivel de riesgo');
  const INDICE_TIPO_ACCESO = ENCABEZADO_EXPORTACION.indexOf('Tipo de Acceso');
  const INDICE_FECHA = ENCABEZADO_EXPORTACION.indexOf('Fecha');
  const INDICE_REVISAR = ENCABEZADO_EXPORTACION.length - 1;

  describe('filaDeExportacion', () => {
    test('la columna se llama "Nivel de riesgo" y usa el vocabulario unificado, con la escala recibida', () => {
      expect(INDICE_NIVEL).toBe(2);
      expect(filaDeExportacion(ochoSiete, CVSS)[INDICE_NIVEL]).toBe('Alto');
      expect(filaDeExportacion(ochoSiete, PROPIA)[INDICE_NIVEL]).toBe('Crítico');
    });

    test('campo opcional faltante (Tipo de Acceso) queda vacío en su columna, marca "Revisar"', () => {
      const sinAcceso = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'OpenSSL');
      const fila = filaDeExportacion(sinAcceso, CVSS);

      expect(fila).toHaveLength(ENCABEZADO_EXPORTACION.length);
      expect(fila[INDICE_TIPO_ACCESO]).toBe('');
      expect(fila[INDICE_FECHA]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fila[INDICE_REVISAR]).toBe('✓');
    });

    test('sin campos vacíos, "Revisar" queda vacío', () => {
      expect(filaDeExportacion(critica, CVSS)[INDICE_REVISAR]).toBe('');
    });
  });

  describe('construirFilasAgrupadasPorNivelDeRiesgo (CSV)', () => {
    test('empieza diciendo la escala, y agrupa con encabezado y separador con conteo por grupo', () => {
      const filas = construirFilasAgrupadasPorNivelDeRiesgo([baja, critica, alta], CVSS);

      expect(filas[0]).toEqual(['Niveles de riesgo según: Escala CVSS (por defecto)']);
      expect(filas[1]).toEqual(ENCABEZADO_EXPORTACION);
      expect(filas[2][0]).toBe('NIVEL DE RIESGO: CRÍTICO (1)');
      expect(filas[3][0]).toBe('CVE-2021-44228');
      expect(filas[3][INDICE_NIVEL]).toBe('Crítico');
      expect(filas[3][3]).toBe('Apache Log4j');
      expect(filas[3][INDICE_TIPO_ACCESO]).toBe('Remoto');
      expect(filas[4][0]).toBe('NIVEL DE RIESGO: ALTO (1)');
      expect(filas[5][INDICE_NIVEL]).toBe('Alto');
      expect(filas[6][0]).toBe('NIVEL DE RIESGO: BAJO (1)');
      expect(filas[7][INDICE_NIVEL]).toBe('Bajo');
    });

    test('con una escala personalizada, la primera línea la nombra', () => {
      expect(construirFilasAgrupadasPorNivelDeRiesgo([], PROPIA)[0]).toEqual([lineaDeEscala(PROPIA)]);
      expect(lineaDeEscala(PROPIA)).toBe('Niveles de riesgo según: Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5');
    });

    test('con campos vacíos, agrega la nota de "Datos incompletos" al final', () => {
      const sinAcceso = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'OpenSSL');
      const filas = construirFilasAgrupadasPorNivelDeRiesgo([sinAcceso], CVSS);

      expect(filas[filas.length - 1][0]).toContain('Datos incompletos');
    });

    test('sin campos vacíos, no agrega ninguna nota', () => {
      const filas = construirFilasAgrupadasPorNivelDeRiesgo([critica], CVSS);
      expect(filas[filas.length - 1][0]).not.toContain('Datos incompletos');
    });

    test('sin vulnerabilidades, exporta solo la escala y el encabezado', () => {
      expect(construirFilasAgrupadasPorNivelDeRiesgo([], CVSS)).toEqual([[lineaDeEscala(CVSS)], ENCABEZADO_EXPORTACION]);
    });
  });

  test('aCsv arma una línea por fila separada por comas', () => {
    const csv = aCsv([['CVE', 'CVSS'], ['CVE-2021-44228', '10']]);
    expect(csv).toBe('CVE,CVSS\nCVE-2021-44228,10');
  });
});
