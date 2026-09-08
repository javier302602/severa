import { analizarDataset } from '../../../../src/domain/services/data-cleaning/CalidadDeDatosGenerico';

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
    // Sin celdas (0 filas), no hay nada que esté "incompleto" — 100% por convención.
    expect(diagnostico.completitudGeneral).toBe(100);
  });

  // M-14 (RF-106): tipo de dato crudo, distinto del tipo semántico.
  describe('tipoDatoCrudo', () => {
    test('columna de números JS reales -> numero', () => {
      const diagnostico = analizarDataset(['edad'], [{ edad: 25 }, { edad: 30 }]);
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('numero');
    });

    test('columna de Date reales (xlsx cellDates) -> fecha', () => {
      const diagnostico = analizarDataset(['fecha'], [{ fecha: new Date('2024-01-01') }, { fecha: new Date('2024-02-01') }]);
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('fecha');
    });

    test('columna de strings que PARECEN fecha (CSV/JSON) -> texto, no fecha (distinción real vs. RF-107)', () => {
      const diagnostico = analizarDataset(['fecha'], [{ fecha: '2024-01-01' }, { fecha: '2024-02-01' }]);
      // RF-107 (tipo semántico) sí la detecta como fecha:
      expect(diagnostico.columnas[0].tipo).toBe('fecha');
      // RF-106 (tipo de dato crudo) distingue que nunca fue un Date real:
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('texto');
    });

    test('columna de booleanos -> booleano', () => {
      const diagnostico = analizarDataset(['activo'], [{ activo: true }, { activo: false }]);
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('booleano');
    });

    test('columna con tipos JS mezclados -> mixto', () => {
      const diagnostico = analizarDataset(['col'], [{ col: 1 }, { col: 'texto' }, { col: true }]);
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('mixto');
    });

    test('columna enteramente vacía -> nulo', () => {
      const diagnostico = analizarDataset(['col'], [{ col: null }, { col: undefined }]);
      expect(diagnostico.columnas[0].tipoDatoCrudo).toBe('nulo');
    });
  });

  // M-14 (RF-106): % de completitud agregado del dataset completo.
  describe('completitudGeneral', () => {
    test('sin ningún faltante -> 100', () => {
      const diagnostico = analizarDataset(['a', 'b'], [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
      expect(diagnostico.completitudGeneral).toBe(100);
    });

    test('con faltantes repartidos entre columnas, calcula el agregado real (no solo el peor caso)', () => {
      // 2 columnas x 4 filas = 8 celdas totales; 2 faltantes (uno por
      // columna) -> completitud = 100 - (2/8)*100 = 75.
      const diagnostico = analizarDataset(
        ['a', 'b'],
        [
          { a: 1, b: 2 },
          { a: null, b: 4 },
          { a: 5, b: null },
          { a: 7, b: 8 }
        ]
      );
      expect(diagnostico.completitudGeneral).toBeCloseTo(75, 5);
    });
  });

  // M-14 (RF-107/RF-109): tipoDetallado y esIdentificador viajan en el mismo
  // DiagnosticoColumna que ya devuelve /analisis-datos/analizar.
  describe('tipoDetallado y esIdentificador', () => {
    test('una columna de códigos casi únicos queda marcada como identificador', () => {
      const filas = Array.from({ length: 10 }, (_, i) => ({ id: `EMP-${i}` }));
      const diagnostico = analizarDataset(['id'], filas);
      expect(diagnostico.columnas[0].tipoDetallado).toBe('identificador');
      expect(diagnostico.columnas[0].esIdentificador).toBe(true);
      // El tipo legado sigue siendo 'texto' (RF-107 no rompe a los consumidores existentes).
      expect(diagnostico.columnas[0].tipo).toBe('texto');
    });

    test('una columna categórica normal no queda marcada como identificador', () => {
      const filas = ['Lima', 'Cusco', 'Lima', 'Lima'].map((ciudad) => ({ ciudad }));
      const diagnostico = analizarDataset(['ciudad'], filas);
      expect(diagnostico.columnas[0].esIdentificador).toBe(false);
    });
  });
});
