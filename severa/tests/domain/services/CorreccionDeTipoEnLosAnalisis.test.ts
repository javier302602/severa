import { analizarDataset } from '../../../src/domain/services/data-cleaning/CalidadDeDatosGenerico';
import { detectarOutliers } from '../../../src/domain/services/data-cleaning/DeteccionOutliersGenerico';
import { analizarColumnaUnivariado } from '../../../src/domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import { calcularMatrizCorrelacion } from '../../../src/domain/services/descriptive-statistics/CorrelacionGenerico';
import { calcularEstadisticasDescriptivas } from '../../../src/domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { CorreccionesDeTipo } from '../../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';

// RF-111: "la corrección se aplica a todos los análisis posteriores sobre esa
// variable". Un mismo dataset, pasado por cada análisis del pipeline genérico
// sin correcciones y con dos:
//   - `cp` (código postal): son números, pero no una cantidad -> categórica.
//   - `edad`: 7 números y 3 "NA"; la detección la toma por texto -> numérica.
// `x` no se corrige y sirve de control: su resultado no puede cambiar.
const COLUMNAS = ['edad', 'cp', 'x'];
const EDAD: unknown[] = [20, 25, 30, 35, 40, 22, 38, 'NA', 'NA', 'NA'];
const CP = [15001, 15003, 15001, 15036, 15003, 15001, 15036, 15074, 15001, 15003];
const X = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5];
const FILAS = EDAD.map((edad, i) => ({ edad, cp: CP[i], x: X[i] }));
const CORRECCIONES: CorreccionesDeTipo = { edad: 'numerica_discreta', cp: 'categorica_nominal' };

describe('RF-111 — la corrección de tipo llega a todos los análisis', () => {
  test('diagnóstico de calidad: muestra el tipo vigente, el detectado y si fue corregido a mano', () => {
    const sin = analizarDataset(COLUMNAS, FILAS).columnas;
    const con = analizarDataset(COLUMNAS, FILAS, CORRECCIONES).columnas;

    expect(sin.map((c) => [c.nombre, c.tipoDetallado, c.tipoDetectado, c.tipoCorregidoManualmente])).toEqual([
      ['edad', 'texto_libre', 'texto_libre', false],
      ['cp', 'numerica_discreta', 'numerica_discreta', false],
      ['x', 'numerica_continua', 'numerica_continua', false]
    ]);
    expect(con.map((c) => [c.nombre, c.tipo, c.tipoDetallado, c.tipoDetectado, c.tipoCorregidoManualmente])).toEqual([
      ['edad', 'numerica', 'numerica_discreta', 'texto_libre', true],
      ['cp', 'categorica', 'categorica_nominal', 'numerica_discreta', true],
      ['x', 'numerica', 'numerica_continua', 'numerica_continua', false]
    ]);
  });

  test('una corrección que coincide con lo detectado no se muestra como "corregida a mano"', () => {
    const [, cp] = analizarDataset(COLUMNAS, FILAS, { cp: 'numerica_discreta' }).columnas;

    expect(cp.tipoCorregidoManualmente).toBe(false);
  });

  test('estadísticas descriptivas: la numérica corregida tiene media; el código deja de tenerla', () => {
    const [edadSin, cpSin] = calcularEstadisticasDescriptivas(COLUMNAS, FILAS);
    const [edadCon, cpCon, xCon] = calcularEstadisticasDescriptivas(COLUMNAS, FILAS, CORRECCIONES);

    expect(edadSin.tipo).toBe('texto');
    expect(cpSin).toMatchObject({ tipo: 'numerica', media: 15015.9 });

    // Los "NA" no entran en el cálculo: 7 valores, media 30.
    expect(edadCon).toMatchObject({ tipo: 'numerica', valoresValidos: 7, media: 30, mediana: 30, minimo: 20, maximo: 40 });
    expect(cpCon).toMatchObject({ tipo: 'categorica', valoresUnicos: 4 });
    expect(cpCon).not.toHaveProperty('media');
    expect(xCon).toEqual(calcularEstadisticasDescriptivas(COLUMNAS, FILAS)[2]);
  });

  test('análisis univariado: el código pasa de intervalos a tabla de categorías', () => {
    const sin = analizarColumnaUnivariado('cp', COLUMNAS, FILAS);
    const con = analizarColumnaUnivariado('cp', COLUMNAS, FILAS, undefined, CORRECCIONES);

    expect(sin.tipo).toBe('numerica');
    expect(con.tipo).toBe('categorica');
    expect(con).toMatchObject({ valoresUnicos: 4, moda: ['15001'] });
    expect(analizarColumnaUnivariado('edad', COLUMNAS, FILAS, undefined, CORRECCIONES)).toMatchObject({ tipo: 'numerica', valoresValidos: 7 });
  });

  test('valores atípicos: solo se buscan en las que quedan como numéricas', () => {
    const sin = detectarOutliers(COLUMNAS, FILAS);
    const con = detectarOutliers(COLUMNAS, FILAS, CORRECCIONES);

    expect(sin.columnas.map((c) => c.columna)).toEqual(['cp', 'x']);
    // El 15074 dejaba de ser un "valor atípico" con sentido: es otro código.
    expect(sin.columnas[0].cantidadValoresAtipicos).toBe(1);

    expect(con.columnas.map((c) => c.columna)).toEqual(['edad', 'x']);
    expect(con.columnasExcluidas).toEqual([{ nombre: 'cp', motivo: 'La columna no es numérica' }]);
  });

  test('correlación: la matriz se arma con las numéricas vigentes', () => {
    expect(calcularMatrizCorrelacion(COLUMNAS, FILAS).columnas).toEqual(['cp', 'x']);

    const con = calcularMatrizCorrelacion(COLUMNAS, FILAS, CORRECCIONES);
    expect(con.columnas).toEqual(['edad', 'x']);
    expect(con.columnasExcluidas).toEqual([{ nombre: 'cp', motivo: 'La columna no es numérica' }]);
  });

  test('pasar un objeto de correcciones vacío es lo mismo que no pasar nada', () => {
    expect(analizarDataset(COLUMNAS, FILAS, {})).toEqual(analizarDataset(COLUMNAS, FILAS));
    expect(calcularEstadisticasDescriptivas(COLUMNAS, FILAS, {})).toEqual(calcularEstadisticasDescriptivas(COLUMNAS, FILAS));
    expect(detectarOutliers(COLUMNAS, FILAS, {})).toEqual(detectarOutliers(COLUMNAS, FILAS));
    expect(calcularMatrizCorrelacion(COLUMNAS, FILAS, {})).toEqual(calcularMatrizCorrelacion(COLUMNAS, FILAS));
  });
});
