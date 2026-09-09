import {
  generarInterpretacionDataset,
  interpretarComposicionDataset,
  interpretarCalidadDatos,
  interpretarCorrelacionMasFuerte,
  interpretarOutliers
} from '../../../src/domain/services/InterpretadorDeResultadosGenerico';
import { DiagnosticoDataset } from '../../../src/domain/services/data-cleaning/CalidadDeDatosGenerico';
import { MatrizCorrelacion } from '../../../src/domain/services/descriptive-statistics/CorrelacionGenerico';
import { ResultadoDeteccionOutliers } from '../../../src/domain/services/data-cleaning/DeteccionOutliersGenerico';
import { detectarVocabularioDataset } from '../../../src/domain/services/reportes/VocabularioDeDominioGenerico';

function diagnosticoDePrueba(overrides: Partial<DiagnosticoDataset> = {}): DiagnosticoDataset {
  return {
    totalFilas: 10,
    filasDuplicadas: 0,
    columnas: [
      { nombre: 'precio', tipo: 'numerica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 10, valoresInconsistentes: 0 },
      { nombre: 'ciudad', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 3, valoresInconsistentes: 0 }
    ],
    ...overrides
  };
}

describe('InterpretadorDeResultadosGenerico — Mejora 4 (Análisis de Datos General) Fase 5', () => {
  test('interpretarComposicionDataset resume filas, columnas y su composición por tipo', () => {
    const texto = interpretarComposicionDataset(diagnosticoDePrueba());
    expect(texto).toContain('10 fila');
    expect(texto).toContain('2 columna');
    expect(texto).toContain('1 numerica');
    expect(texto).toContain('1 categorica');
  });

  test('interpretarCalidadDatos menciona duplicados y columnas con más de 20% de faltantes', () => {
    const diagnostico = diagnosticoDePrueba({
      filasDuplicadas: 2,
      columnas: [
        { nombre: 'precio', tipo: 'numerica', valoresFaltantes: 5, porcentajeFaltante: 50, valoresUnicos: 5, valoresInconsistentes: 0 }
      ]
    });

    const texto = interpretarCalidadDatos(diagnostico);
    expect(texto).toContain('2 fila(s) duplicada(s)');
    expect(texto).toContain('"precio"');
    expect(texto).toContain('50.0%');
  });

  test('interpretarCalidadDatos sin duplicados ni faltantes altos da un mensaje limpio', () => {
    const texto = interpretarCalidadDatos(diagnosticoDePrueba());
    expect(texto).toContain('No se detectaron filas duplicadas');
    expect(texto).toContain('Ninguna columna supera el 20%');
  });

  test('interpretarCorrelacionMasFuerte con menos de 2 columnas numéricas lo indica explícitamente', () => {
    const matriz: MatrizCorrelacion = { columnas: ['precio'], filas: [{ columna: 'precio', correlaciones: [{ columna: 'precio', valor: 1 }] }], columnasExcluidas: [] };
    expect(interpretarCorrelacionMasFuerte(matriz)).toContain('al menos dos columnas');
  });

  test('interpretarCorrelacionMasFuerte identifica el par con mayor |r|, ignorando la diagonal y los null', () => {
    const matriz: MatrizCorrelacion = {
      columnas: ['a', 'b', 'c'],
      filas: [
        { columna: 'a', correlaciones: [{ columna: 'a', valor: 1 }, { columna: 'b', valor: 0.2 }, { columna: 'c', valor: -0.9 }] },
        { columna: 'b', correlaciones: [{ columna: 'a', valor: 0.2 }, { columna: 'b', valor: 1 }, { columna: 'c', valor: null, motivo: 'sin pares' }] },
        { columna: 'c', correlaciones: [{ columna: 'a', valor: -0.9 }, { columna: 'b', valor: null, motivo: 'sin pares' }, { columna: 'c', valor: 1 }] }
      ],
      columnasExcluidas: []
    };

    const texto = interpretarCorrelacionMasFuerte(matriz);
    expect(texto).toContain('"a"');
    expect(texto).toContain('"c"');
    expect(texto).toContain('-0.900');
    expect(texto).toContain('fuerte');
    expect(texto).toContain('negativa');
  });

  test('interpretarOutliers sin atípicos da un mensaje limpio', () => {
    const resultado: ResultadoDeteccionOutliers = {
      columnas: [
        {
          columna: 'precio', q1: 1, q3: 2, rangoIntercuartilico: 1, limiteInferior: -0.5, limiteSuperior: 3.5,
          media: 1.5, desviacionEstandar: 0.5, limiteInferiorSigma: 0, limiteSuperiorSigma: 3,
          cantidadValoresAtipicos: 0, valoresAtipicos: []
        }
      ],
      columnasExcluidas: []
    };
    expect(interpretarOutliers(resultado)).toContain('No se detectaron valores atípicos');
  });

  test('interpretarOutliers con atípicos los cuenta y nombra la(s) columna(s)', () => {
    const resultado: ResultadoDeteccionOutliers = {
      columnas: [
        {
          columna: 'precio', q1: 1, q3: 2, rangoIntercuartilico: 1, limiteInferior: -0.5, limiteSuperior: 3.5,
          media: 1.5, desviacionEstandar: 40, limiteInferiorSigma: -118.5, limiteSuperiorSigma: 121.5,
          cantidadValoresAtipicos: 2,
          valoresAtipicos: [
            { filaIndice: 0, valor: 100, detectadoPor: ['iqr'] },
            { filaIndice: 1, valor: -50, detectadoPor: ['iqr'] }
          ]
        }
      ],
      columnasExcluidas: []
    };

    const texto = interpretarOutliers(resultado);
    expect(texto).toContain('2 valor(es) atípico(s)');
    expect(texto).toContain('"precio" (2)');
  });

  test('generarInterpretacionDataset devuelve exactamente 4 párrafos, uno por sección', () => {
    const matriz: MatrizCorrelacion = { columnas: [], filas: [], columnasExcluidas: [] };
    const outliers: ResultadoDeteccionOutliers = { columnas: [], columnasExcluidas: [] };
    const resultado = generarInterpretacionDataset(diagnosticoDePrueba(), matriz, outliers);
    expect(resultado).toHaveLength(4);
    resultado.forEach((parrafo) => expect(typeof parrafo).toBe('string'));
  });

  // RF-134 (M-10 Ronda 2, Pasada 1): vocabulario derivado de nombres de
  // columna — los tests de arriba (columnas 'precio'/'ciudad', sin dominio
  // reconocible) quedan intactos porque resuelven al vocabulario neutro
  // ("fila(s)"), idéntico al comportamiento de siempre.
  describe('RF-134 — vocabulario adaptado al dominio', () => {
    test('interpretarComposicionDataset usa la unidad del dominio detectado en vez de "fila(s)"', () => {
      const diagnostico = diagnosticoDePrueba({
        totalFilas: 5,
        columnas: [
          { nombre: 'especie', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 5, valoresInconsistentes: 0 },
          { nombre: 'peso_kg', tipo: 'numerica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 5, valoresInconsistentes: 0 }
        ]
      });

      const vocabulario = detectarVocabularioDataset(diagnostico.columnas.map((columna) => columna.nombre));
      const texto = interpretarComposicionDataset(diagnostico, vocabulario);

      expect(texto).toContain('5 espec');
      expect(texto).not.toContain('fila');
    });

    test('interpretarCalidadDatos usa la unidad del dominio detectado, sin adjetivo pegado (sin problema de género)', () => {
      const diagnostico = diagnosticoDePrueba({
        filasDuplicadas: 3,
        columnas: [
          { nombre: 'cliente_id', tipo: 'texto', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 10, valoresInconsistentes: 0 },
          { nombre: 'producto', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 4, valoresInconsistentes: 0 }
        ]
      });

      const vocabulario = detectarVocabularioDataset(diagnostico.columnas.map((columna) => columna.nombre));
      const texto = interpretarCalidadDatos(diagnostico, vocabulario);

      expect(texto).toContain('3 duplicado(s) exacto(s) de clientes');
      expect(texto).not.toContain('fila');
    });

    test('generarInterpretacionDataset propaga el vocabulario detectado a composición y calidad, sin afectar correlación/outliers', () => {
      const diagnostico = diagnosticoDePrueba({
        columnas: [
          { nombre: 'especie', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 3, valoresInconsistentes: 0 }
        ]
      });
      const matriz: MatrizCorrelacion = { columnas: [], filas: [], columnasExcluidas: [] };
      const outliers: ResultadoDeteccionOutliers = { columnas: [], columnasExcluidas: [] };

      const [composicion, calidad] = generarInterpretacionDataset(diagnostico, matriz, outliers);

      expect(composicion).toContain('espec');
      expect(calidad).toContain('espec');
    });
  });
});
