import { analizarDataset } from '../../src/domain/services/CalidadDeDatosGenerico';

describe('CalidadDeDatosGenerico', () => {
  test('reporta valores faltantes y su porcentaje por columna', () => {
    const columnas = ['nombre', 'edad'];
    const filas = [
      { nombre: 'Ana', edad: 25 },
      { nombre: 'Beto', edad: null },
      { nombre: null, edad: 30 },
      { nombre: 'Cami', edad: 40 }
    ];

    const diagnostico = analizarDataset(columnas, filas);

    const edad = diagnostico.columnas.find((c) => c.nombre === 'edad')!;
    expect(edad.tipo).toBe('numerica');
    expect(edad.valoresFaltantes).toBe(1);
    expect(edad.porcentajeFaltante).toBeCloseTo(25, 5);

    const nombre = diagnostico.columnas.find((c) => c.nombre === 'nombre')!;
    expect(nombre.valoresFaltantes).toBe(1);
  });

  test('detecta filas duplicadas exactas (cuenta las copias extra, no la primera aparición)', () => {
    const columnas = ['cve', 'cvss'];
    const filas = [
      { cve: 'A', cvss: 9.8 },
      { cve: 'B', cvss: 5.0 },
      { cve: 'A', cvss: 9.8 }, // duplicado de la fila 1
      { cve: 'A', cvss: 9.8 }, // duplicado de la fila 1 otra vez
      { cve: 'C', cvss: 7.0 }
    ];

    const diagnostico = analizarDataset(columnas, filas);

    expect(diagnostico.totalFilas).toBe(5);
    expect(diagnostico.filasDuplicadas).toBe(2);
  });

  test('reporta valores inconsistentes: no vacíos que no calzan con el tipo mayoritario de la columna', () => {
    const columnas = ['edad'];
    const filas = [{ edad: 25 }, { edad: 30 }, { edad: 45 }, { edad: 19 }, { edad: 'veinte' }];

    const diagnostico = analizarDataset(columnas, filas);

    const edad = diagnostico.columnas[0];
    expect(edad.tipo).toBe('numerica');
    expect(edad.valoresInconsistentes).toBe(1);
    expect(edad.valoresFaltantes).toBe(0);
  });

  test('columnas categóricas/texto no reportan inconsistencias (cualquier valor no vacío es válido)', () => {
    const columnas = ['ciudad'];
    // 8 filas, solo 3 ciudades distintas: cardinalidad baja -> categórica
    // (mismo umbral que DetectorDeTipoDeColumna.test.ts).
    const filas = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima'].map((ciudad) => ({ ciudad }));

    const diagnostico = analizarDataset(columnas, filas);

    expect(diagnostico.columnas[0].tipo).toBe('categorica');
    expect(diagnostico.columnas[0].valoresInconsistentes).toBe(0);
  });

  test('cuenta valores únicos por columna (case-insensitive, ignorando espacios)', () => {
    const columnas = ['ciudad'];
    const filas = [{ ciudad: 'Lima' }, { ciudad: ' lima ' }, { ciudad: 'Cusco' }];

    const diagnostico = analizarDataset(columnas, filas);

    expect(diagnostico.columnas[0].valoresUnicos).toBe(2);
  });

  test('sin filas, no rompe y devuelve un diagnóstico vacío consistente', () => {
    const diagnostico = analizarDataset(['a', 'b'], []);
    expect(diagnostico.totalFilas).toBe(0);
    expect(diagnostico.filasDuplicadas).toBe(0);
    expect(diagnostico.columnas.every((c) => c.valoresFaltantes === 0)).toBe(true);
  });
});
