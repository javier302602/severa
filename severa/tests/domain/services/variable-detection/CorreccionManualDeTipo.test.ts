import {
  ETIQUETA_DE_TIPO_DETALLADO,
  TIPOS_DE_COLUMNA_DETALLADOS,
  aFechaGenerica,
  esFecha,
  esTipoColumnaDetallado,
  inferirTipoColumnaDetallado,
  motivoDeTipoNoAplicable,
  resolverTipoColumna,
  resolverTipoColumnaDetallado
} from '../../../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';

// RF-111 (M-14, Ronda 2): "el analista puede corregir manualmente el tipo
// detectado para cualquier variable. La corrección se aplica a todos los
// análisis posteriores". Todo el pipeline genérico resuelve el tipo de una
// columna con resolverTipoColumna / resolverTipoColumnaDetallado, así que lo
// que se prueba acá vale para todos los análisis.
describe('RF-111 — tipos que el analista puede elegir', () => {
  test('la lista de tipos y sus etiquetas cubren exactamente los mismos 9 tipos', () => {
    expect(TIPOS_DE_COLUMNA_DETALLADOS).toHaveLength(9);
    expect(Object.keys(ETIQUETA_DE_TIPO_DETALLADO).sort()).toEqual([...TIPOS_DE_COLUMNA_DETALLADOS].sort());
  });

  test('esTipoColumnaDetallado solo acepta los tipos de la lista', () => {
    expect(esTipoColumnaDetallado('categorica_nominal')).toBe(true);
    expect(esTipoColumnaDetallado('fecha_hora')).toBe(true);
    // El tipo "legado" de 4 valores no es un tipo detallado.
    expect(esTipoColumnaDetallado('numerica')).toBe(false);
    expect(esTipoColumnaDetallado('')).toBe(false);
    expect(esTipoColumnaDetallado(null)).toBe(false);
    expect(esTipoColumnaDetallado(3)).toBe(false);
    // Nombres de propiedades heredadas de Object: no son tipos.
    expect(esTipoColumnaDetallado('constructor')).toBe(false);
  });
});

describe('RF-111 — cuándo un tipo NO se puede aplicar a una columna', () => {
  test('numérica: hace falta al menos un número', () => {
    expect(motivoDeTipoNoAplicable('numerica_continua', ['a', 'b', 'c'])).toBe('ninguno de sus valores es un número');
    // No se exige mayoría: para eso existe la corrección manual.
    expect(motivoDeTipoNoAplicable('numerica_continua', ['a', 'b', 'c', '4.5'])).toBeNull();
  });

  test('numérica discreta: no puede tener decimales', () => {
    expect(motivoDeTipoNoAplicable('numerica_discreta', [1, 2, 3.5])).toBe('tiene valores con decimales');
    expect(motivoDeTipoNoAplicable('numerica_discreta', [1, 2, '3'])).toBeNull();
    // 2.0 es un entero aunque venga escrito con punto.
    expect(motivoDeTipoNoAplicable('numerica_discreta', ['2.0', 4])).toBeNull();
  });

  test('fecha: hace falta al menos una fecha reconocible', () => {
    expect(motivoDeTipoNoAplicable('fecha', ['hola', 'chau'])).toMatch(/ninguno de sus valores es una fecha/);
    expect(motivoDeTipoNoAplicable('fecha', ['hola', '15/01/2024'])).toBeNull();
    expect(motivoDeTipoNoAplicable('fecha_hora', ['2024-01-15 10:30'])).toBeNull();
  });

  test('binaria: exactamente dos valores distintos, sin contar mayúsculas ni tildes', () => {
    expect(motivoDeTipoNoAplicable('binaria', ['Sí', 'si', 'SI', 'no'])).toBeNull();
    expect(motivoDeTipoNoAplicable('binaria', ['a', 'b', 'c'])).toBe('tiene 3 valor(es) distinto(s), y una variable binaria tiene exactamente 2');
    expect(motivoDeTipoNoAplicable('binaria', ['a', 'a'])).toBe('tiene 1 valor(es) distinto(s), y una variable binaria tiene exactamente 2');
  });

  test('categórica, texto libre e identificador se pueden aplicar a cualquier columna con valores', () => {
    const valores = [1, 2, 3, 'x'];
    expect(motivoDeTipoNoAplicable('categorica_nominal', valores)).toBeNull();
    expect(motivoDeTipoNoAplicable('categorica_ordinal', valores)).toBeNull();
    expect(motivoDeTipoNoAplicable('texto_libre', valores)).toBeNull();
    expect(motivoDeTipoNoAplicable('identificador', valores)).toBeNull();
  });

  test('una columna completamente vacía no admite ningún tipo', () => {
    TIPOS_DE_COLUMNA_DETALLADOS.forEach((tipo) => {
      expect(motivoDeTipoNoAplicable(tipo, [null, '', '   ', undefined])).toBe('la columna no tiene ningún valor');
    });
  });
});

describe('RF-111 — el tipo vigente de una columna', () => {
  // El caso típico: un código que es un número pero no una cantidad.
  const codigosPostales = [15001, 15003, 15001, 15036, 15003, 15001, 15036, 15074];

  test('sin correcciones, el tipo vigente es el detectado', () => {
    expect(resolverTipoColumnaDetallado('cp', codigosPostales)).toBe(inferirTipoColumnaDetallado(codigosPostales));
    expect(resolverTipoColumnaDetallado('cp', codigosPostales, {})).toBe('numerica_discreta');
  });

  test('con una corrección para esa columna, manda la corrección', () => {
    expect(resolverTipoColumnaDetallado('cp', codigosPostales, { cp: 'categorica_nominal' })).toBe('categorica_nominal');
    // ...y el tipo de 4 valores que usan los cálculos la sigue.
    expect(resolverTipoColumna('cp', codigosPostales)).toBe('numerica');
    expect(resolverTipoColumna('cp', codigosPostales, { cp: 'categorica_nominal' })).toBe('categorica');
  });

  test('la corrección de una columna no afecta a las demás', () => {
    expect(resolverTipoColumnaDetallado('edad', [20, 31, 45], { cp: 'categorica_nominal' })).toBe('numerica_discreta');
  });

  test('el nombre de la columna se compara exacto (distingue mayúsculas y espacios)', () => {
    expect(resolverTipoColumnaDetallado('CP', codigosPostales, { cp: 'categorica_nominal' })).toBe('numerica_discreta');
  });

  test('una corrección que ya no es aplicable a los datos se ignora, no rompe el análisis', () => {
    // Guardada como binaria, pero estos datos tienen tres valores distintos
    // (por ejemplo, otra versión del dataset): se vuelve a la detección.
    expect(resolverTipoColumnaDetallado('estado', ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a'], { estado: 'binaria' })).toBe(
      'categorica_nominal'
    );
  });

  test('una columna llamada como una propiedad de Object no toma un "tipo" heredado', () => {
    expect(resolverTipoColumnaDetallado('constructor', [1, 2, 3], {})).toBe('numerica_discreta');
    expect(resolverTipoColumnaDetallado('toString', [1, 2, 3], {})).toBe('numerica_discreta');
  });
});

// Marcas de tiempo como las exporta cualquier API o base de datos. Antes de
// M-14 Ronda 2 una columna así se detectaba como texto o identificador.
describe('fechas ISO con fracción de segundo y zona horaria', () => {
  test.each(['2024-01-15T10:30:00.000Z', '2024-01-15T10:30:00Z', '2024-01-15T10:30:00-05:00', '2024-01-15T10:30:00+0530', '2024-01-15 10:30:00.123456'])(
    '%s se reconoce como fecha',
    (texto) => {
      expect(esFecha(texto)).toBe(true);
    }
  );

  test('con zona explícita se lleva el instante a UTC', () => {
    expect(aFechaGenerica('2024-01-15T10:30:00-05:00').toISOString()).toBe('2024-01-15T15:30:00.000Z');
    expect(aFechaGenerica('2024-01-15T10:30:00+0530').toISOString()).toBe('2024-01-15T05:00:00.000Z');
    expect(aFechaGenerica('2024-01-15T10:30:00.999Z').toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  test('sin zona es una fecha de calendario: no depende de la zona del servidor', () => {
    expect(aFechaGenerica('2024-01-15 10:30').toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  test('una columna de marcas de tiempo se detecta como fecha y hora', () => {
    const marcas = Array.from({ length: 10 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`);
    expect(inferirTipoColumnaDetallado(marcas)).toBe('fecha_hora');
  });

});

// esFecha y aFechaGenerica tienen que estar de acuerdo: si una dice "es
// fecha", la otra la tiene que poder convertir.
describe('una fecha imposible no es una fecha', () => {
  test.each(['31/02/2024', '2024-02-31', '2024-02-31T10:00:00Z', '2024-01-15T25:00:00Z', '29/02/2023', '00/01/2024', '15/13/2024'])(
    '%s no se reconoce como fecha',
    (texto) => {
      expect(esFecha(texto)).toBe(false);
      expect(Number.isNaN(aFechaGenerica(texto).getTime())).toBe(true);
    }
  );

  test('el 29 de febrero de un año bisiesto sí', () => {
    expect(esFecha('29/02/2024')).toBe(true);
    expect(aFechaGenerica('29/02/2024').toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });
});
