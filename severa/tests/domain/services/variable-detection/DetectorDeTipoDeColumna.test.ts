import {
  inferirTipoColumna,
  inferirTipoColumnaDetallado,
  esIdentificador,
  esNumerico,
  esFecha,
  esVacio,
  calzaConTipo,
  MAPEO_A_TIPO_LEGADO,
  TipoColumna
} from '../../../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';

describe('DetectorDeTipoDeColumna', () => {
  describe('inferirTipoColumna', () => {
    test('detecta columna numérica (todos los valores son números)', () => {
      expect(inferirTipoColumna([25, 30, 45, 19, 60])).toBe('numerica');
    });

    test('detecta columna numérica con strings numéricos', () => {
      expect(inferirTipoColumna(['25', '30', '45'])).toBe('numerica');
    });

    test('detecta numérica aunque el 20% tenga errores de tipeo (umbral de mayoría)', () => {
      expect(inferirTipoColumna([25, 30, 45, 19, 'N/A'])).toBe('numerica');
    });

    test('detecta columna de fecha (formato ISO)', () => {
      expect(inferirTipoColumna(['2024-01-15', '2024-02-20', '2024-03-01'])).toBe('fecha');
    });

    test('detecta columna de fecha con objetos Date reales (xlsx cellDates)', () => {
      expect(inferirTipoColumna([new Date('2024-01-15'), new Date('2024-02-20')])).toBe('fecha');
    });

    test('detecta categórica cuando hay pocos valores únicos respecto al total', () => {
      const ciudades = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima'];
      expect(inferirTipoColumna(ciudades)).toBe('categorica');
    });

    test('detecta texto libre cuando casi todos los valores son distintos', () => {
      const descripciones = [
        'Falla de autenticación en el módulo de login',
        'Error de validación en el formulario de registro',
        'Timeout al conectar con el servicio de pagos',
        'Excepción no controlada en el reporte mensual'
      ];
      expect(inferirTipoColumna(descripciones)).toBe('texto');
    });

    test('ignora valores vacíos (null/undefined/string vacío) al inferir', () => {
      expect(inferirTipoColumna([25, null, 30, undefined, '', 45])).toBe('numerica');
    });

    test('una columna enteramente vacía se degrada a texto (sin evidencia para adivinar)', () => {
      expect(inferirTipoColumna([null, undefined, ''])).toBe('texto');
    });
  });

  describe('predicados individuales', () => {
    test('esVacio reconoce null, undefined y string en blanco', () => {
      expect(esVacio(null)).toBe(true);
      expect(esVacio(undefined)).toBe(true);
      expect(esVacio('   ')).toBe(true);
      expect(esVacio(0)).toBe(false);
      expect(esVacio('0')).toBe(false);
    });

    test('esNumerico acepta números y strings numéricos, rechaza texto', () => {
      expect(esNumerico(42)).toBe(true);
      expect(esNumerico('42.5')).toBe(true);
      expect(esNumerico('abc')).toBe(false);
      expect(esNumerico(NaN)).toBe(false);
    });

    test('esFecha exige un formato reconocible, no acepta cualquier string parseable', () => {
      expect(esFecha('2024-01-15')).toBe(true);
      expect(esFecha('15/01/2024')).toBe(true);
      expect(esFecha('hola')).toBe(false);
      // Un string puramente numérico no debe confundirse con fecha aunque
      // Date.parse() sea permisivo con algunos formatos.
      expect(esFecha('12345')).toBe(false);
    });

    test('calzaConTipo valida numérica/fecha, pero acepta cualquier no-vacío para categórica/texto', () => {
      expect(calzaConTipo('abc', 'numerica')).toBe(false);
      expect(calzaConTipo('42', 'numerica')).toBe(true);
      expect(calzaConTipo('cualquier cosa', 'categorica')).toBe(true);
      expect(calzaConTipo('cualquier cosa', 'texto')).toBe(true);
    });
  });

  // RF-107 (M-14): las 9 categorías detalladas.
  describe('inferirTipoColumnaDetallado', () => {
    test('numérica con todos enteros -> numerica_discreta', () => {
      expect(inferirTipoColumnaDetallado([1, 2, 3, 4, 5])).toBe('numerica_discreta');
    });

    test('numérica con al menos un decimal -> numerica_continua', () => {
      expect(inferirTipoColumnaDetallado([1, 2.5, 3, 4])).toBe('numerica_continua');
    });

    test('numérica con strings enteros -> numerica_discreta', () => {
      expect(inferirTipoColumnaDetallado(['1', '2', '3'])).toBe('numerica_discreta');
    });

    test('fecha ISO sin hora -> fecha', () => {
      expect(inferirTipoColumnaDetallado(['2024-01-15', '2024-02-20', '2024-03-01'])).toBe('fecha');
    });

    test('fecha ISO con componente de hora en al menos un valor -> fecha_hora', () => {
      expect(inferirTipoColumnaDetallado(['2024-01-15', '2024-02-20T10:30:00'])).toBe('fecha_hora');
    });

    test('Date real sin componente de hora -> fecha', () => {
      const medianoche = new Date('2024-01-15T00:00:00');
      expect(inferirTipoColumnaDetallado([medianoche, new Date('2024-02-20T00:00:00')])).toBe('fecha');
    });

    test('Date real con componente de hora -> fecha_hora', () => {
      const conHora = new Date('2024-01-15T14:30:00');
      expect(inferirTipoColumnaDetallado([conHora, new Date('2024-02-20T00:00:00')])).toBe('fecha_hora');
    });

    test('fecha DD/MM/AAAA nunca tiene hora -> siempre fecha', () => {
      expect(inferirTipoColumnaDetallado(['15/01/2024', '20/02/2024'])).toBe('fecha');
    });

    test('exactamente 2 valores únicos categóricos -> binaria', () => {
      expect(inferirTipoColumnaDetallado(['Sí', 'No', 'Sí', 'Sí', 'No'])).toBe('binaria');
    });

    test('categórica con escala ordinal conocida -> categorica_ordinal', () => {
      const valores = ['Bajo', 'Medio', 'Alto', 'Medio', 'Bajo', 'Alto', 'Medio', 'Bajo'];
      expect(inferirTipoColumnaDetallado(valores)).toBe('categorica_ordinal');
    });

    test('escala ordinal conocida con tildes/mayúsculas distintas también matchea (normalización)', () => {
      // La variación de tildes/mayúsculas cuenta como valor "distinto" para
      // la cardinalidad EXTERNA (esa comparación no normaliza tildes — es la
      // misma que usa el algoritmo original, no se puede tocar sin romper
      // la garantía de compatibilidad) — por eso hay bastante repetición de
      // las formas "canónicas" para que la cardinalidad total siga <=0.5 y
      // el valor llegue al bucket categórico, donde SÍ se normaliza para
      // decidir nominal/ordinal.
      const valores = ['Bajo', 'Bajo', 'Bajo', 'Bajo', 'Medio', 'Medio', 'Medio', 'Alto', 'Alto', 'Alto', 'BAJO', 'médio'];
      expect(inferirTipoColumnaDetallado(valores)).toBe('categorica_ordinal');
    });

    test('escala ordinal conocida con algún nivel ausente (subconjunto de 3+ valores) también matchea', () => {
      // 'malo'/'regular'/'excelente' son 3 de los 5 niveles de la escala
      // ['pesimo','malo','regular','bueno','excelente'] — falta 'pesimo' y
      // 'bueno', sigue siendo subconjunto. Con exactamente 2 valores únicos
      // el clasificador prioriza "binaria" (ver test aparte) — este caso usa
      // 3 para probar el subconjunto de verdad, no el camino de binaria.
      const valores = ['Malo', 'Malo', 'Malo', 'Regular', 'Regular', 'Regular', 'Excelente', 'Excelente', 'Excelente'];
      expect(inferirTipoColumnaDetallado(valores)).toBe('categorica_ordinal');
    });

    test('categórica sin escala conocida -> categorica_nominal', () => {
      const ciudades = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima'];
      expect(inferirTipoColumnaDetallado(ciudades)).toBe('categorica_nominal');
    });

    test('escala ordinal real pero con etiquetas fuera del diccionario -> nominal (limitación documentada)', () => {
      // Suficiente repetición para que la cardinalidad externa (4 únicos)
      // se mantenga <=0.5 y el valor llegue al bucket categórico — si no,
      // caería en texto/identificador antes de llegar a nominal/ordinal.
      const niveles = [
        'Freshman', 'Freshman', 'Freshman',
        'Sophomore', 'Sophomore', 'Sophomore',
        'Junior', 'Junior', 'Junior',
        'Senior', 'Senior', 'Senior'
      ];
      expect(inferirTipoColumnaDetallado(niveles)).toBe('categorica_nominal');
    });

    test('cardinalidad muy alta con suficiente muestra -> identificador', () => {
      const uuids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
      expect(inferirTipoColumnaDetallado(uuids)).toBe('identificador');
    });

    test('cardinalidad alta pero con muestra insuficiente -> texto_libre, no identificador', () => {
      // 3 valores, los 3 distintos (cardinalidad 1.0) pero por debajo de
      // MINIMO_MUESTRA_IDENTIFICADOR (5) — no hay evidencia suficiente.
      expect(inferirTipoColumnaDetallado(['a-1', 'a-2', 'a-3'])).toBe('texto_libre');
    });

    test('texto libre real (prosa, baja cardinalidad relativa alta pero no al punto de identificador)', () => {
      const descripciones = [
        'Falla de autenticación en el módulo de login',
        'Error de validación en el formulario de registro',
        'Timeout al conectar con el servicio de pagos',
        'Excepción no controlada en el reporte mensual',
        'Falla de autenticación en el módulo de login'
      ];
      expect(inferirTipoColumnaDetallado(descripciones)).toBe('texto_libre');
    });

    test('columna enteramente vacía -> texto_libre', () => {
      expect(inferirTipoColumnaDetallado([null, undefined, ''])).toBe('texto_libre');
    });
  });

  describe('esIdentificador (RF-109)', () => {
    test('true para una columna con cardinalidad casi única y muestra suficiente', () => {
      const codigos = Array.from({ length: 10 }, (_, i) => `EMP-${String(i).padStart(3, '0')}`);
      expect(esIdentificador(codigos)).toBe(true);
    });

    test('false para una columna categórica de baja cardinalidad', () => {
      expect(esIdentificador(['Lima', 'Cusco', 'Lima', 'Lima'])).toBe(false);
    });

    test('false para una columna numérica (aunque sea toda distinta) — RF-107 no permite que "identificador" venga del bucket numérico', () => {
      const idsNumericos = Array.from({ length: 20 }, (_, i) => i);
      expect(esIdentificador(idsNumericos)).toBe(false);
    });
  });

  // RF-107: garantía de compatibilidad hacia atrás. inferirTipoColumna hoy es
  // MAPEO_A_TIPO_LEGADO[inferirTipoColumnaDetallado(valores)] — lo que este
  // bloque prueba es que ese resultado sigue coincidiendo con el algoritmo
  // ORIGINAL de 4 categorías tal como se comportaba antes de esta ampliación
  // (copiado acá tal cual, no reimplementado "a ojo"), para un conjunto
  // amplio de entradas — no unos pocos ejemplos sueltos.
  describe('RF-107 — compatibilidad garantizada con el algoritmo original de 4 categorías', () => {
    // Copia literal del árbol de decisión que este archivo tenía ANTES de
    // RF-107 (mismos umbrales, mismo orden, mismas funciones esVacio/
    // esNumerico/esFecha reexportadas sin cambios) — sirve de "oráculo"
    // independiente de cómo esté implementado inferirTipoColumna hoy.
    function inferirTipoColumnaOriginalDeReferencia(valores: unknown[]): TipoColumna {
      const UMBRAL_MAYORIA_REF = 0.8;
      const UMBRAL_CARDINALIDAD_CATEGORICA_REF = 0.5;
      const noVacios = valores.filter((valor) => !esVacio(valor));
      if (noVacios.length === 0) return 'texto';

      const proporcion = (predicado: (valor: unknown) => boolean) =>
        noVacios.filter(predicado).length / noVacios.length;

      if (proporcion(esNumerico) >= UMBRAL_MAYORIA_REF) return 'numerica';
      if (proporcion(esFecha) >= UMBRAL_MAYORIA_REF) return 'fecha';

      const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;
      const cardinalidadRelativa = valoresUnicos / noVacios.length;
      if (cardinalidadRelativa <= UMBRAL_CARDINALIDAD_CATEGORICA_REF) return 'categorica';

      return 'texto';
    }

    // Generador de una amplia variedad de columnas: numéricas (enteras/
    // decimales, varios tamaños y niveles de ruido), fechas (ISO, DD/MM/AAAA,
    // Date real, con/sin hora), categóricas (binaria, ordinal conocida,
    // ordinal desconocida, nominal, barriendo cardinalidad de 1 a 20 sobre
    // 20 filas) y texto/identificador (barriendo cardinalidad relativa desde
    // 0.5 hasta 1.0). ~90 casos en total.
    function generarCasosDePrueba(): Array<{ etiqueta: string; valores: unknown[] }> {
      const casos: Array<{ etiqueta: string; valores: unknown[] }> = [];

      // Numéricas: varios tamaños, enteras y decimales, con y sin ruido.
      for (const n of [2, 3, 5, 10, 50]) {
        casos.push({ etiqueta: `numerica entera n=${n}`, valores: Array.from({ length: n }, (_, i) => i) });
        casos.push({ etiqueta: `numerica decimal n=${n}`, valores: Array.from({ length: n }, (_, i) => i + 0.25) });
        casos.push({
          etiqueta: `numerica con 15% de ruido n=${n}`,
          valores: Array.from({ length: n }, (_, i) => (i % 7 === 0 ? 'N/A' : i))
        });
      }

      // Fechas: ISO con/sin hora, DD/MM/AAAA, Date real con/sin hora.
      casos.push({ etiqueta: 'fecha ISO sin hora', valores: ['2024-01-01', '2024-06-15', '2024-12-31'] });
      casos.push({ etiqueta: 'fecha ISO con hora en algún valor', valores: ['2024-01-01', '2024-06-15T08:00:00'] });
      casos.push({ etiqueta: 'fecha DD/MM/AAAA', valores: ['01/01/2024', '15/06/2024', '31/12/2024'] });
      casos.push({ etiqueta: 'Date real sin hora', valores: [new Date('2024-01-01T00:00:00'), new Date('2024-06-15T00:00:00')] });
      casos.push({ etiqueta: 'Date real con hora', valores: [new Date('2024-01-01T09:30:00'), new Date('2024-06-15T00:00:00')] });

      // Categóricas: barrido de cardinalidad de 1 a 20 sobre 20 filas fijas
      // (cubre binaria en cardinalidad=2, categórica en <=10, texto/identificador en >10).
      for (let cardinalidad = 1; cardinalidad <= 20; cardinalidad++) {
        const valores = Array.from({ length: 20 }, (_, i) => `valor-${i % cardinalidad}`);
        casos.push({ etiqueta: `cardinalidad ${cardinalidad}/20`, valores });
      }

      // Escalas ordinales conocidas y desconocidas, y binaria explícita.
      casos.push({ etiqueta: 'ordinal conocida bajo/medio/alto', valores: ['Bajo', 'Medio', 'Alto', 'Bajo', 'Medio'] });
      casos.push({ etiqueta: 'ordinal desconocida (freshman/senior)', valores: ['Freshman', 'Senior', 'Freshman', 'Junior'] });
      casos.push({ etiqueta: 'binaria Sí/No', valores: ['Sí', 'No', 'Sí', 'No', 'Sí'] });
      casos.push({ etiqueta: 'binaria numérica 0/1 (sigue siendo numerica_discreta)', valores: [0, 1, 0, 1, 1, 0] });

      // Texto/identificador: barrido de cardinalidad relativa desde el
      // límite del bucket categórico (0.5) hasta 1.0, con muestra suficiente.
      for (const cardinalidadRelativa of [0.55, 0.7, 0.85, 0.89, 0.9, 0.95, 1.0]) {
        const n = 20;
        const cantidadUnicos = Math.round(cardinalidadRelativa * n);
        const valores = Array.from({ length: n }, (_, i) => `texto-${i % cantidadUnicos}`);
        casos.push({ etiqueta: `texto/identificador cardinalidad ${cardinalidadRelativa}`, valores });
      }

      // Vacíos y casos límite.
      casos.push({ etiqueta: 'enteramente vacía', valores: [null, undefined, ''] });
      casos.push({ etiqueta: 'un solo valor no vacío', valores: [42] });
      casos.push({ etiqueta: 'cardinalidad alta pero muestra insuficiente', valores: ['a', 'b', 'c'] });

      return casos;
    }

    const casos = generarCasosDePrueba();

    test(`se generaron suficientes casos de prueba (${casos.length}) para que la propiedad sea significativa`, () => {
      expect(casos.length).toBeGreaterThanOrEqual(50);
    });

    test.each(casos)('$etiqueta: inferirTipoColumna coincide con el algoritmo original', ({ valores }) => {
      expect(inferirTipoColumna(valores)).toBe(inferirTipoColumnaOriginalDeReferencia(valores));
    });

    test.each(casos)('$etiqueta: MAPEO_A_TIPO_LEGADO[inferirTipoColumnaDetallado(valores)] coincide con inferirTipoColumna(valores)', ({ valores }) => {
      expect(MAPEO_A_TIPO_LEGADO[inferirTipoColumnaDetallado(valores)]).toBe(inferirTipoColumna(valores));
    });
  });
});
