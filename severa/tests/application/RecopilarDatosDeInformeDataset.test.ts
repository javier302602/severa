import { recopilarDatosDeInformeDataset } from '../../src/application/usecases/RecopilarDatosDeInformeDataset';

describe('RecopilarDatosDeInformeDataset — Mejora 4 (Análisis de Datos General) Fase 5', () => {
  test('arma el DTO completo a partir de columnas/filas: diagnóstico, estadísticas, univariado, correlación, outliers e interpretación', () => {
    const columnas = ['producto', 'precio', 'cantidad'];
    const filas = [
      { producto: 'A', precio: 10, cantidad: 100 },
      { producto: 'B', precio: 12, cantidad: 120 },
      { producto: 'C', precio: 11, cantidad: 110 },
      { producto: 'D', precio: 13, cantidad: 130 },
      { producto: 'E', precio: 100, cantidad: 1000 }
    ];

    const datos = recopilarDatosDeInformeDataset(columnas, filas, 'Analista de Prueba');

    expect(datos.totalFilas).toBe(5);
    expect(datos.totalColumnas).toBe(3);
    expect(datos.columnas).toHaveLength(3);
    expect(datos.estadisticasDescriptivas).toHaveLength(3);

    // Solo columnas numéricas en el análisis univariado.
    expect(datos.analisisUnivariado.map((a) => a.nombre).sort()).toEqual(['cantidad', 'precio']);
    expect(datos.analisisUnivariado.every((a) => a.tipo === 'numerica')).toBe(true);

    expect(datos.matrizCorrelacion.columnas.sort()).toEqual(['cantidad', 'precio']);
    expect(datos.outliers.columnas.map((c) => c.columna).sort()).toEqual(['cantidad', 'precio']);
    expect(datos.outliers.columnas.find((c) => c.columna === 'precio')?.cantidadValoresAtipicos).toBe(1);

    expect(datos.interpretacion).toHaveLength(4);
    expect(datos.limitacionesConocidas.length).toBeGreaterThan(0);
    expect(datos.generadoEn).toBeInstanceOf(Date);
  });

  test('dataset sin columnas numéricas: análisis univariado y correlación quedan vacíos, sin romper', () => {
    const columnas = ['ciudad'];
    const filas = ['Lima', 'Cusco', 'Arequipa'].map((ciudad) => ({ ciudad }));

    const datos = recopilarDatosDeInformeDataset(columnas, filas, 'Analista de Prueba');

    expect(datos.analisisUnivariado).toEqual([]);
    expect(datos.matrizCorrelacion.columnas).toEqual([]);
    expect(datos.outliers.columnas).toEqual([]);
  });
});
