import {
  generarDatosHistogramaCvss,
  contarPorSeveridad,
  contarPorCategoria,
  generarTopN,
  generarTopTiposClasificados,
  generarDatosHistogramaAgrupado,
  generarDatosPromedioPorCategoria,
  generarDatosHistogramaDiasParche
} from '../../../../src/domain/services/graphs/GraficosEstadisticos';
import { obtenerSeveridadPorDefecto } from '../../../../src/domain/services/classification/VariablesVulnerabilidad';
import { Vulnerabilidad } from '../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../src/domain/shared/value-objects/TipoAcceso';

describe('GraficosEstadisticos', () => {
  test('genera bins de histograma y conteos por severidad', () => {
    const scores = [2.1, 4.0, 4.0, 7.8, 9.2, 10.0];
    const histograma = generarDatosHistogramaCvss(scores, { intervalos: 4 });

    expect(histograma.bins).toHaveLength(4);
    expect(histograma.bins.reduce((total, bin) => total + bin.frecuencia, 0)).toBe(scores.length);
    expect(histograma.media).toBeCloseTo(6.1833333333, 5);
    expect(histograma.mediana).toBeCloseTo(5.9, 5);

    const severidades = contarPorSeveridad(scores);
    expect(severidades).toEqual([
      { etiqueta: 'Baja', valor: 1 },
      { etiqueta: 'Media', valor: 2 },
      { etiqueta: 'Alta', valor: 1 },
      { etiqueta: 'Crítica', valor: 2 }
    ]);
  });

  test('genera el histograma agrupado reutilizando la tabla de frecuencias', () => {
    const agrupado = generarDatosHistogramaAgrupado([2.1, 4.0, 4.0, 7.8, 9.2, 10.0]);

    expect(agrupado.bins).toHaveLength(5);
    expect(agrupado.bins.reduce((total, bin) => total + bin.frecuencia, 0)).toBe(6);
    expect(agrupado.bins[2].frecuencia).toBe(2);
    expect(agrupado.bins[4].frecuencia).toBe(2);
  });

  // M-07 (retoma, RF-56/57): generarDatosCvssPorAcceso se retiró (único
  // consumidor era GenerarGrafico.ts) — generarDatosPromedioPorCategoria la
  // reemplaza, y con los defaults ('tipoAcceso','cvssScore') da EXACTAMENTE
  // el mismo resultado que la función retirada daba (mismos fixtures).
  describe('generarDatosPromedioPorCategoria (reemplaza a generarDatosCvssPorAcceso)', () => {
    const vulnerabilidades = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'Apache Log4j', new TipoAccesoValue('Sí'), 5),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'Apache Log4j', new TipoAccesoValue('No'), 8),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'OpenSSL', new TipoAccesoValue('Sí'), 2),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('No'), 1)
    ];

    test('RETROCOMPATIBILIDAD: sin variables explícitas, compara la media de CVSS por tipo de acceso (igual que la función retirada)', () => {
      const acceso = generarDatosPromedioPorCategoria(vulnerabilidades);

      expect(acceso).toEqual([
        { etiqueta: 'Remoto', valor: 8.9 },
        { etiqueta: 'Local', valor: 8.8 }
      ]);
    });

    test('con variableAgrupacion="estadoRemediacion", promedia por las 3 categorías de estado', () => {
      const conEstados = [
        vulnerabilidades[0].transicionarEstado('EnProceso'),
        vulnerabilidades[1],
        vulnerabilidades[2].transicionarEstado('EnProceso').transicionarEstado('Remediada'),
        vulnerabilidades[3]
      ];

      const resultado = generarDatosPromedioPorCategoria(conEstados, 'estadoRemediacion', 'cvssScore');

      // Pendiente: CVE2 (9.8) y CVE4 (7.8) -> promedio 8.8.
      // EnProceso: CVE1 (10) sola. Remediada: CVE3 (7.8) sola.
      expect(resultado).toEqual([
        { etiqueta: 'Pendiente', valor: 8.8 },
        { etiqueta: 'EnProceso', valor: 10 },
        { etiqueta: 'Remediada', valor: 7.8 }
      ]);
    });

    test('con variableValor="diasParaParche", promedia días para parche en vez de CVSS, por tipo de acceso', () => {
      const resultado = generarDatosPromedioPorCategoria(vulnerabilidades, 'tipoAcceso', 'diasParaParche');

      // Remoto: CVEs 1 y 3 -> dias 5 y 2 -> promedio 3.5. Local: CVEs 2 y 4 -> dias 8 y 1 -> promedio 4.5.
      expect(resultado).toEqual([
        { etiqueta: 'Remoto', valor: 3.5 },
        { etiqueta: 'Local', valor: 4.5 }
      ]);
    });

    test('categoría sin ninguna vulnerabilidad queda en 0, no rompe', () => {
      const soloRemoto = [vulnerabilidades[0], vulnerabilidades[2]];
      const resultado = generarDatosPromedioPorCategoria(soloRemoto);

      expect(resultado).toEqual([
        { etiqueta: 'Remoto', valor: 8.9 },
        { etiqueta: 'Local', valor: 0 }
      ]);
    });
  });

  // M-07 (retoma, RF-52/53): Modo A — contarPorCategoria generaliza
  // contarPorSeveridad a cualquier variable categórica existente.
  describe('contarPorCategoria (generaliza contarPorSeveridad)', () => {
    const vulnerabilidades = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.5), 'A', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(2.0), 'B', new TipoAccesoValue('No')),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(3.0), 'C', new TipoAccesoValue('No'))
    ];

    test('RETROCOMPATIBILIDAD: sin variable explícita (o "severidad"), delega en contarPorSeveridad', () => {
      const scores = vulnerabilidades.map((v) => v.cvssScore.valor);
      expect(contarPorCategoria(vulnerabilidades)).toEqual(contarPorSeveridad(scores));
      expect(contarPorCategoria(vulnerabilidades, 'severidad')).toEqual(contarPorSeveridad(scores));
    });

    test('con variable="tipoAcceso", cuenta por Remoto/Local', () => {
      expect(contarPorCategoria(vulnerabilidades, 'tipoAcceso')).toEqual([
        { etiqueta: 'Remoto', valor: 1 },
        { etiqueta: 'Local', valor: 2 }
      ]);
    });

    test('con variable="estadoRemediacion", cuenta por las 3 categorías, con 0 para las que no tienen datos', () => {
      expect(contarPorCategoria(vulnerabilidades, 'estadoRemediacion')).toEqual([
        { etiqueta: 'Pendiente', valor: 3 },
        { etiqueta: 'EnProceso', valor: 0 },
        { etiqueta: 'Remediada', valor: 0 }
      ]);
    });
  });

  // M-07 (retoma): reconciliación de ETIQUETA_POR_NIVEL — contarPorSeveridad
  // ahora usa obtenerSeveridadPorDefecto() (VariablesVulnerabilidad.ts, M-04)
  // en vez de un mapa NivelDeRiesgo->etiqueta propio. Verifica no-regresión
  // cruzando el resultado real contra la fuente única.
  test('no-regresión: contarPorSeveridad sigue usando las mismas etiquetas que obtenerSeveridadPorDefecto()', () => {
    const scores = [1.0, 5.0, 8.0, 9.5];
    const resultado = contarPorSeveridad(scores);
    const etiquetasEsperadas = scores.map((score) => obtenerSeveridadPorDefecto(new CvssScore(score)));

    resultado.forEach((entrada) => {
      const cantidadEsperada = etiquetasEsperadas.filter((e) => e === entrada.etiqueta).length;
      expect(entrada.valor).toBe(cantidadEsperada);
    });
  });

  test('genera el histograma de días para parche', () => {
    const dias = generarDatosHistogramaDiasParche([1, 2, 2, 5, 10]);

    expect(dias.bins).toHaveLength(5);
    expect(dias.bins.reduce((total, bin) => total + bin.frecuencia, 0)).toBe(5);
  });

  // Fase 0 (regresión): bug real confirmado en vivo contra GET
  // /graficos/histogramaDiasParche — "Días para Parche" legítimamente supera
  // 10 (ej. 90 días), pero antes calcularMedia/calcularMediana rechazaban
  // cualquier valor fuera de 0-10 con un mensaje hardcodeado de "CVSS Score".
  test('no rechaza días para parche mayores a 10 (bug real corregido en Fase 0)', () => {
    const dias = generarDatosHistogramaDiasParche([1, 5, 22, 45, 90]);

    expect(dias.bins.reduce((total, bin) => total + bin.frecuencia, 0)).toBe(5);
    expect(dias.media).toBeCloseTo(32.6, 5);
  });

  test('genera el top N de software y tipos', () => {
    const vulnerabilidades = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'Apache Log4j', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'Apache Log4j', new TipoAccesoValue('No')),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'OpenSSL', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('No'))
    ];

    const software = generarTopN(vulnerabilidades, 'software', 3);
    const tipos = generarTopN(vulnerabilidades, 'tipo', 3);

    expect(software).toEqual([
      { etiqueta: 'Apache Log4j', valor: 2 },
      { etiqueta: 'Nginx', valor: 1 },
      { etiqueta: 'OpenSSL', valor: 1 }
    ]);
    // Ninguna de las 4 vulnerabilidades de este fixture pasa
    // tipoVulnerabilidad explícito, así que cae en el default del propio
    // dominio ('N/A', ver Vulnerabilidad.ts) — no en 'Desconocido', que era
    // el valor hardcodeado del bug ya corregido (ver test siguiente).
    expect(tipos).toEqual([
      { etiqueta: 'N/A', valor: 4 }
    ]);
  });

  // Fase 1 (regresión): bug real confirmado en vivo contra GET
  // /graficos/topTipos — la rama 'tipo' ignoraba tipoVulnerabilidad y
  // devolvía siempre 'Desconocido' para todas las vulnerabilidades.
  test('top N por tipo de vulnerabilidad usa tipoVulnerabilidad, no un valor fijo (bug real corregido en Fase 1)', () => {
    const vulnerabilidades = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, undefined, 'Code Injection'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, undefined, 'Buffer Overflow'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('Sí'), undefined, undefined, 'Code Injection')
    ];

    const tipos = generarTopN(vulnerabilidades, 'tipo', 10);

    expect(tipos).toEqual([
      { etiqueta: 'Code Injection', valor: 2 },
      { etiqueta: 'Buffer Overflow', valor: 1 }
    ]);
  });

  // Bug real reportado con capturas: en un dataset NVD real, "Sin
  // clasificar" concentraba el 89.9% de las filas y dominaba tan
  // fuertemente la escala lineal del gráfico que las categorías reales
  // quedaban invisibles. Decisión confirmada con el usuario: excluirlo del
  // ranking (no es un tipo real) e informar el conteo aparte.
  describe('generarTopTiposClasificados', () => {
    test('excluye "Sin clasificar" y "N/A" del ranking, e informa cuántas se excluyeron', () => {
      const vulnerabilidades = [
        new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'A', undefined, undefined, undefined, 'Sin clasificar'),
        new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'B', undefined, undefined, undefined, 'Sin clasificar'),
        new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'C', undefined, undefined, undefined, 'N/A'),
        new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'D', undefined, undefined, undefined, 'Code Injection'),
        new Vulnerabilidad('5', new IdentificadorCVE('CVE-2024-00005'), new CvssScore(6.5), 'E', undefined, undefined, undefined, 'Buffer Overflow')
      ];

      const resultado = generarTopTiposClasificados(vulnerabilidades, 10);

      expect(resultado.datos).toEqual([
        { etiqueta: 'Buffer Overflow', valor: 1 },
        { etiqueta: 'Code Injection', valor: 1 }
      ]);
      expect(resultado.totalSinClasificar).toBe(3);
    });

    test('sin ninguna vulnerabilidad sin clasificar, el conteo excluido es 0', () => {
      const vulnerabilidades = [
        new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'A', undefined, undefined, undefined, 'Code Injection')
      ];

      const resultado = generarTopTiposClasificados(vulnerabilidades, 10);

      expect(resultado.totalSinClasificar).toBe(0);
      expect(resultado.datos).toEqual([{ etiqueta: 'Code Injection', valor: 1 }]);
    });

    test('si TODAS son sin clasificar, el ranking queda vacío y el total excluido es el total de la muestra', () => {
      const vulnerabilidades = [
        new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10), 'A', undefined, undefined, undefined, 'Sin clasificar'),
        new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'B', undefined, undefined, undefined, 'N/A')
      ];

      const resultado = generarTopTiposClasificados(vulnerabilidades, 10);

      expect(resultado.datos).toEqual([]);
      expect(resultado.totalSinClasificar).toBe(2);
    });
  });

  // Bug real reproducido en vivo (2026-07-19, 150k-350k filas reales vía
  // Postgres): "Math.min(...valores)"/"Math.max(...valores)" pasan cada
  // elemento como un argumento de función aparte — V8 tiene un límite de
  // ~120k-130k argumentos por llamada, así que con un dataset grande esto
  // lanzaba "RangeError: Maximum call stack size exceeded" (confirmado
  // contra /graficos/histogramaCvss real, y contra GenerarInforme/
  // GenerarResumenEjecutivo, que reusan esta misma función). 200.000 en el
  // test para estar claramente por encima del umbral real medido (~125.000).
  describe('generarDatosHistogramaCvss con datasets grandes (bug real: Maximum call stack size exceeded)', () => {
    test('no lanza con 200.000 valores (antes rompía por Math.min/max con spread)', () => {
      const scores = Array.from({ length: 200_000 }, (_, i) => (i % 101) / 10);

      expect(() => generarDatosHistogramaCvss(scores, { intervalos: 5 })).not.toThrow();

      const resultado = generarDatosHistogramaCvss(scores, { intervalos: 5 });
      expect(resultado.bins.reduce((suma, bin) => suma + bin.frecuencia, 0)).toBe(200_000);
    });
  });
});
