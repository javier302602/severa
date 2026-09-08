import {
  analizarDataset,
  esValorFaltante,
  detectarFilasIncompletas,
  detectarFilasDuplicadas,
  validarRango
} from '../../../../src/domain/services/data-cleaning/CalidadDeDatosGenerico';
import { inferirTipoColumna, inferirTipoColumnaDetallado } from '../../../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';

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

  // M-15 (RF-113): marcadores de faltantes además de null/undefined/vacío.
  describe('esValorFaltante / RF-113', () => {
    test.each(['NA', 'na', 'Na', ' NA ', 'N/A', 'n/a', 'NULL', 'null', '-', '?'])(
      '"%s" cuenta como faltante',
      (marcador) => {
        expect(esValorFaltante(marcador)).toBe(true);
      }
    );

    test.each([null, undefined, '', '   '])('sigue reconociendo los vacíos de siempre: %p', (valor) => {
      expect(esValorFaltante(valor)).toBe(true);
    });

    test.each(['NADA', 'ANULADO', 'not applicable', 0, false, 'veinte'])(
      'no confunde texto parecido ni valores legítimos: %p',
      (valor) => {
        expect(esValorFaltante(valor)).toBe(false);
      }
    );

    test('analizarDataset reconoce los marcadores como faltantes, ya no como inconsistentes', () => {
      // 8 números reales + 2 marcadores en 10 valores: proporción de
      // numéricos sobre los valores CRUDOS (esVacio, sin ampliar) = 8/10 =
      // 0.8, justo el umbral de mayoría -> sigue siendo 'numerica' igual
      // que antes de RF-113 (ver el describe de no-regresión más abajo).
      const filas = [25, 30, 35, 45, 50, 55, 60, 65, 'NA', '-'].map((edad) => ({ edad }));
      const diagnostico = analizarDataset(['edad'], filas);

      const edad = diagnostico.columnas[0];
      expect(edad.tipo).toBe('numerica');
      expect(edad.valoresFaltantes).toBe(2);
      expect(edad.porcentajeFaltante).toBeCloseTo(20, 5);
      // Antes de RF-113 estas 2 celdas contaban como valoresInconsistentes
      // (no calzaban con el tipo numérico); ahora se reclasifican como
      // faltantes, no como inconsistentes — no se cuentan dos veces.
      expect(edad.valoresInconsistentes).toBe(0);
    });

    test('un valor realmente inconsistente (no un marcador reconocido) se sigue reportando aparte', () => {
      const filas = [25, 30, 35, 45, 50, 55, 60, 65, 'NA', 'veinte'].map((edad) => ({ edad }));
      const diagnostico = analizarDataset(['edad'], filas);

      const edad = diagnostico.columnas[0];
      expect(edad.tipo).toBe('numerica');
      expect(edad.valoresFaltantes).toBe(1); // solo "NA"
      expect(edad.valoresInconsistentes).toBe(1); // solo "veinte"
    });

    // Prueba de no-regresión (garantía de arquitectura, no una observación
    // puntual): analizarColumna() calcula tipo/tipoDetallado SIEMPRE sobre
    // `valores` crudos, nunca sobre la población filtrada por
    // esValorFaltante() — así que su resultado debe coincidir, para
    // cualquier entrada, con llamar directo a inferirTipoColumna/
    // inferirTipoColumnaDetallado sobre esos mismos valores crudos. Si algún
    // cambio futuro "optimizara" analizarColumna para reusar `noFaltantes`
    // en vez de `valores` al inferir el tipo, este test lo detecta.
    describe('no-regresión: esValorFaltante() nunca cambia el tipo detectado', () => {
      function generarCasosConMarcadoresDeFaltante(): Array<{ etiqueta: string; valores: unknown[] }> {
        const marcadores = ['NA', 'N/A', 'null', '-', '?', 'Na', ' na '];
        const casos: Array<{ etiqueta: string; valores: unknown[] }> = [];

        // El caso de riesgo real identificado al planear: una columna con
        // proporción de numéricos justo debajo del umbral de mayoría (0.8)
        // por culpa de los marcadores contando en el denominador. Si
        // esVacio() se hubiera ampliado directamente, estos 2 casos
        // pasarían a ser 'numerica' — acá deben seguir sin serlo.
        casos.push({ etiqueta: 'riesgo: 7 numéricos + 2 "NA" en 9 (7/9=0.778 < 0.8)', valores: [1, 2, 3, 4, 5, 6, 7, 'NA', 'NA'] });
        casos.push({ etiqueta: 'riesgo: 7 numéricos + 2 "-" en 9', valores: [1, 2, 3, 4, 5, 6, 7, '-', '-'] });

        // Barrido de proporción de marcadores (10%, 20%, 30%, 50%) sobre
        // columnas numéricas, de fecha, categóricas y de texto/identificador.
        for (const proporcionMarcador of [0.1, 0.2, 0.3, 0.5]) {
          const n = 20;
          const cantidadMarcadores = Math.round(n * proporcionMarcador);

          marcadores.forEach((marcador, i) => {
            const numerica = Array.from({ length: n }, (_, idx) =>
              idx < cantidadMarcadores ? marcadores[(idx + i) % marcadores.length] : idx + 1
            );
            casos.push({ etiqueta: `numérica con ${proporcionMarcador * 100}% de "${marcador}"`, valores: numerica });

            const fecha = Array.from({ length: n }, (_, idx) =>
              idx < cantidadMarcadores ? marcadores[(idx + i) % marcadores.length] : `2024-01-${String((idx % 27) + 1).padStart(2, '0')}`
            );
            casos.push({ etiqueta: `fecha con ${proporcionMarcador * 100}% de "${marcador}"`, valores: fecha });

            const categorica = Array.from({ length: n }, (_, idx) =>
              idx < cantidadMarcadores ? marcadores[(idx + i) % marcadores.length] : `valor-${idx % 3}`
            );
            casos.push({ etiqueta: `categórica con ${proporcionMarcador * 100}% de "${marcador}"`, valores: categorica });

            const texto = Array.from({ length: n }, (_, idx) =>
              idx < cantidadMarcadores ? marcadores[(idx + i) % marcadores.length] : `texto-libre-${idx}`
            );
            casos.push({ etiqueta: `texto/identificador con ${proporcionMarcador * 100}% de "${marcador}"`, valores: texto });
          });
        }

        return casos;
      }

      const casos = generarCasosConMarcadoresDeFaltante();

      test(`se generaron suficientes casos (${casos.length}) para que la propiedad sea significativa`, () => {
        expect(casos.length).toBeGreaterThanOrEqual(50);
      });

      test.each(casos)('$etiqueta: tipo coincide con inferirTipoColumna(valores) directo', ({ valores }) => {
        const diagnostico = analizarDataset(['col'], valores.map((valor) => ({ col: valor })));
        expect(diagnostico.columnas[0].tipo).toBe(inferirTipoColumna(valores));
      });

      test.each(casos)('$etiqueta: tipoDetallado coincide con inferirTipoColumnaDetallado(valores) directo', ({ valores }) => {
        const diagnostico = analizarDataset(['col'], valores.map((valor) => ({ col: valor })));
        expect(diagnostico.columnas[0].tipoDetallado).toBe(inferirTipoColumnaDetallado(valores));
      });

      test('caso de riesgo del plan: 7 numéricos + 2 "NA" en 9 sigue sin ser numérica', () => {
        const valores = [1, 2, 3, 4, 5, 6, 7, 'NA', 'NA'];
        const diagnostico = analizarDataset(['col'], valores.map((valor) => ({ col: valor })));
        expect(diagnostico.columnas[0].tipo).not.toBe('numerica');
        // Pero sí se reconocen como faltantes para las métricas de calidad.
        expect(diagnostico.columnas[0].valoresFaltantes).toBe(2);
      });
    });
  });

  // M-15 (RF-115): columnas vacías o constantes (sin variabilidad).
  describe('variabilidad / RF-115', () => {
    test('columna con un único valor real repetido -> constante', () => {
      const filas = ['activo', 'activo', 'activo'].map((estado) => ({ estado }));
      const diagnostico = analizarDataset(['estado'], filas);
      expect(diagnostico.columnas[0].variabilidad).toBe('constante');
    });

    test('columna donde todo es un marcador de faltante -> vacía (RF-113 + RF-115 combinados)', () => {
      const filas = ['NA', 'null', '-', null].map((valor) => ({ campo: valor }));
      const diagnostico = analizarDataset(['campo'], filas);
      expect(diagnostico.columnas[0].variabilidad).toBe('vacia');
    });

    test('columna con más de un valor real -> normal', () => {
      const filas = ['Lima', 'Cusco', 'Lima'].map((ciudad) => ({ ciudad }));
      const diagnostico = analizarDataset(['ciudad'], filas);
      expect(diagnostico.columnas[0].variabilidad).toBe('normal');
    });

    test('no sugiere exclusión automática: la columna constante sigue en el diagnóstico igual que cualquier otra', () => {
      const filas = [1, 1, 1].map((n) => ({ n }));
      const diagnostico = analizarDataset(['n'], filas);
      expect(diagnostico.columnas).toHaveLength(1);
      expect(diagnostico.columnas[0].variabilidad).toBe('constante');
    });
  });

  // M-15 (RF-116): duplicados por subconjunto configurable de columnas clave.
  describe('detectarFilasDuplicadas / RF-116', () => {
    test('con todas las columnas como clave, el total coincide con filasDuplicadas del diagnóstico', () => {
      const columnas = ['cve', 'cvss'];
      const filas = [
        { cve: 'A', cvss: 9.8 },
        { cve: 'B', cvss: 5.0 },
        { cve: 'A', cvss: 9.8 },
        { cve: 'A', cvss: 9.8 },
        { cve: 'C', cvss: 7.0 }
      ];

      const diagnostico = analizarDataset(columnas, filas);
      const resultado = detectarFilasDuplicadas(columnas, filas);

      expect(resultado.totalFilasDuplicadas).toBe(diagnostico.filasDuplicadas);
    });

    test('con un subconjunto de columnas clave, detecta duplicados que la comparación completa no vería', () => {
      // cve+cvss son distintos entre sí (fechas distintas), pero por "cve"
      // solo hay dos filas iguales -> duplicado por clave, no exacto.
      const filas = [
        { cve: 'A', fecha: '2024-01-01' },
        { cve: 'A', fecha: '2024-02-01' },
        { cve: 'B', fecha: '2024-01-01' }
      ];

      const porTodasLasColumnas = detectarFilasDuplicadas(['cve', 'fecha'], filas);
      expect(porTodasLasColumnas.totalFilasDuplicadas).toBe(0);

      const porColumnaClave = detectarFilasDuplicadas(['cve'], filas);
      expect(porColumnaClave.totalFilasDuplicadas).toBe(1);
      expect(porColumnaClave.grupos).toEqual([
        { valoresClave: { cve: 'A' }, indicesFilas: [0, 1] }
      ]);
    });

    test('sin duplicados, devuelve grupos vacíos', () => {
      const filas = [{ cve: 'A' }, { cve: 'B' }, { cve: 'C' }];
      const resultado = detectarFilasDuplicadas(['cve'], filas);
      expect(resultado.totalFilasDuplicadas).toBe(0);
      expect(resultado.grupos).toEqual([]);
    });
  });

  // M-15 (RF-114): filas incompletas por umbral configurable.
  describe('detectarFilasIncompletas / RF-114', () => {
    test('marca filas cuyo % de campos faltantes alcanza o supera el umbral', () => {
      const columnas = ['a', 'b', 'c', 'd'];
      const filas = [
        { a: 1, b: 2, c: 3, d: 4 }, // 0% faltante
        { a: 1, b: null, c: null, d: 4 }, // 50% faltante
        { a: 'NA', b: '-', c: null, d: undefined } // 100% faltante (marcadores incluidos)
      ];

      const resultado = detectarFilasIncompletas(columnas, filas, 50);

      expect(resultado.umbralPorcentaje).toBe(50);
      expect(resultado.filasIncompletas).toEqual([
        { indiceFila: 1, porcentajeFaltante: 50 },
        { indiceFila: 2, porcentajeFaltante: 100 }
      ]);
    });

    test('usa 50 como umbral por defecto si no se especifica', () => {
      const columnas = ['a', 'b'];
      const filas = [{ a: null, b: 1 }];
      const resultado = detectarFilasIncompletas(columnas, filas);
      expect(resultado.umbralPorcentaje).toBe(50);
    });

    test('con un umbral más estricto, una fila con un solo campo faltante también puede calificar', () => {
      const columnas = ['a', 'b', 'c', 'd'];
      const filas = [{ a: null, b: 1, c: 2, d: 3 }]; // 25% faltante
      expect(detectarFilasIncompletas(columnas, filas, 25).filasIncompletas).toHaveLength(1);
      expect(detectarFilasIncompletas(columnas, filas, 30).filasIncompletas).toHaveLength(0);
    });

    test('sin columnas, no rompe y no marca nada', () => {
      expect(detectarFilasIncompletas([], [{}]).filasIncompletas).toEqual([]);
    });
  });

  // M-15 (RF-117): valores numéricos fuera de un rango configurado.
  describe('validarRango / RF-117', () => {
    test('reporta las filas cuyo valor numérico cae fuera de [minimo, maximo]', () => {
      const filas = [{ edad: 25 }, { edad: -5 }, { edad: 200 }, { edad: 40 }];
      const resultado = validarRango('edad', filas, 0, 120);

      expect(resultado.cantidadFueraDeRango).toBe(2);
      expect(resultado.filasFueraDeRango).toEqual([
        { indiceFila: 1, valor: -5 },
        { indiceFila: 2, valor: 200 }
      ]);
    });

    test('ignora valores faltantes o no numéricos (eso ya lo reportan otros campos)', () => {
      const filas = [{ edad: 25 }, { edad: null }, { edad: 'NA' }, { edad: 'treinta' }];
      const resultado = validarRango('edad', filas, 0, 120);
      expect(resultado.cantidadFueraDeRango).toBe(0);
    });

    test('acepta valores numéricos que llegan como string (ej. de un CSV)', () => {
      const filas = [{ edad: '25' }, { edad: '200' }];
      const resultado = validarRango('edad', filas, 0, 120);
      expect(resultado.cantidadFueraDeRango).toBe(1);
      expect(resultado.filasFueraDeRango).toEqual([{ indiceFila: 1, valor: 200 }]);
    });

    test('es un chequeo adicional al de tipo: un valor numérico válido puede estar fuera de rango igual', () => {
      const filas = [{ edad: -5 }];
      const diagnostico = analizarDataset(['edad'], filas);
      // -5 calza con el tipo numérico -> no es "inconsistente"...
      expect(diagnostico.columnas[0].valoresInconsistentes).toBe(0);
      // ...pero validarRango sí lo marca fuera de dominio.
      expect(validarRango('edad', filas, 0, 120).cantidadFueraDeRango).toBe(1);
    });
  });

  // M-15 (RF-118): formatos inconsistentes dentro de una misma columna.
  describe('formatoFechaInconsistente y formatoTextoInconsistente / RF-118', () => {
    test('columna de fecha mezclando ISO y DD/MM/AAAA queda marcada, con normalización sugerida', () => {
      const filas = ['2024-01-15', '15/02/2024', '2024-03-20'].map((fecha) => ({ fecha }));
      const diagnostico = analizarDataset(['fecha'], filas);

      const columna = diagnostico.columnas[0];
      expect(columna.tipo).toBe('fecha');
      expect(columna.formatoFechaInconsistente).toBeDefined();
      const formatos = columna.formatoFechaInconsistente!.formatosEncontrados;
      expect(formatos.map((f) => f.formato).sort()).toEqual(['dia_mes_anio', 'iso']);
      expect(formatos.find((f) => f.formato === 'iso')!.cantidad).toBe(2);
      expect(formatos.find((f) => f.formato === 'dia_mes_anio')!.cantidad).toBe(1);
      expect(columna.formatoFechaInconsistente!.normalizacionSugerida).toContain('ISO 8601');
      // Nunca se aplica sola: los valores originales del dataset no cambian.
      expect(filas[1].fecha).toBe('15/02/2024');
    });

    test('un valor que no calza con ningún formato de fecha conocido (parte de la minoría del umbral) se ignora, no rompe el conteo', () => {
      // 4 ISO + 1 valor que no matchea ningún patrón de fecha: 4/5 = 0.8
      // sigue alcanzando el umbral de mayoría -> tipo sigue siendo 'fecha'
      // (ese valor ya se reporta aparte como valorInconsistente).
      const filas = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', 'no-es-fecha'].map((fecha) => ({ fecha }));
      const diagnostico = analizarDataset(['fecha'], filas);

      const columna = diagnostico.columnas[0];
      expect(columna.tipo).toBe('fecha');
      expect(columna.valoresInconsistentes).toBe(1);
      // Un solo formato real (ISO) entre los que sí calzan -> no se marca.
      expect(columna.formatoFechaInconsistente).toBeUndefined();
    });

    test('un valor no-string y no-Date dentro de una columna de fecha se ignora al clasificar formato (no rompe)', () => {
      // 4 ISO + 1 número crudo (no es marcador de faltante ni fecha real):
      // 4/5 = 0.8 sigue alcanzando el umbral de mayoría -> tipo 'fecha'.
      const filas: Array<{ fecha: unknown }> = [
        { fecha: '2024-01-01' },
        { fecha: '2024-02-01' },
        { fecha: '2024-03-01' },
        { fecha: '2024-04-01' },
        { fecha: 12345 }
      ];
      const diagnostico = analizarDataset(['fecha'], filas);

      expect(diagnostico.columnas[0].tipo).toBe('fecha');
      // Un solo formato real entre los valores de fecha (ISO) -> no se marca.
      expect(diagnostico.columnas[0].formatoFechaInconsistente).toBeUndefined();
    });

    test('columna de fecha en un solo formato no se marca', () => {
      const filas = ['2024-01-15', '2024-02-20', '2024-03-01'].map((fecha) => ({ fecha }));
      const diagnostico = analizarDataset(['fecha'], filas);
      expect(diagnostico.columnas[0].formatoFechaInconsistente).toBeUndefined();
    });

    test('columna categórica con mayúsculas/minúsculas mezcladas queda marcada por grupo', () => {
      // 8 filas, cardinalidad baja -> categórica (mismo umbral de siempre).
      const filas = ['Activo', 'ACTIVO', 'activo', 'Inactivo', 'Activo', 'Inactivo', 'activo', 'Activo'].map((estado) => ({ estado }));
      const diagnostico = analizarDataset(['estado'], filas);

      const columna = diagnostico.columnas[0];
      expect(columna.tipo).toBe('categorica');
      expect(columna.formatoTextoInconsistente).toBeDefined();
      const grupoActivo = columna.formatoTextoInconsistente!.grupos.find((g) => g.formaNormalizada === 'activo')!;
      expect(grupoActivo.variantes.map((v) => v.valorCrudo).sort()).toEqual(['ACTIVO', 'Activo', 'activo']);
    });

    test('un valor no-string dentro de una columna categórica se ignora al agrupar variantes (no rompe)', () => {
      // 'A'/'A'/'B'/'B' + dos números 1/1: cardinalidad 3/6=0.5 -> categórica.
      // Los números no tienen "mayúsculas/minúsculas" que revisar.
      const filas: Array<{ campo: unknown }> = [{ campo: 'A' }, { campo: 'A' }, { campo: 'B' }, { campo: 'B' }, { campo: 1 }, { campo: 1 }];
      const diagnostico = analizarDataset(['campo'], filas);

      expect(diagnostico.columnas[0].tipo).toBe('categorica');
      expect(diagnostico.columnas[0].formatoTextoInconsistente).toBeUndefined();
    });

    test('columna categórica ya consistente no se marca', () => {
      const filas = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima'].map((ciudad) => ({ ciudad }));
      const diagnostico = analizarDataset(['ciudad'], filas);
      expect(diagnostico.columnas[0].formatoTextoInconsistente).toBeUndefined();
    });

    test('texto libre/identificador NO se revisa (variación esperable, no es ruido a reportar)', () => {
      const filas = Array.from({ length: 10 }, (_, i) => ({ id: i % 2 === 0 ? `EMP-${i}` : `emp-${i}` }));
      const diagnostico = analizarDataset(['id'], filas);
      expect(diagnostico.columnas[0].tipo).toBe('texto');
      expect(diagnostico.columnas[0].formatoTextoInconsistente).toBeUndefined();
    });

    test('columna numérica no se revisa por ninguno de los dos criterios de formato', () => {
      const filas = [1, 2, 3].map((n) => ({ n }));
      const diagnostico = analizarDataset(['n'], filas);
      expect(diagnostico.columnas[0].formatoFechaInconsistente).toBeUndefined();
      expect(diagnostico.columnas[0].formatoTextoInconsistente).toBeUndefined();
    });
  });
});
