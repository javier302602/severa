import {
  detectarVocabularioDataset,
  VOCABULARIO_NEUTRO
} from '../../../../src/domain/services/reportes/VocabularioDeDominioGenerico';

describe('VocabularioDeDominioGenerico', () => {
  test('sin ninguna columna reconocible, devuelve el vocabulario neutro', () => {
    expect(detectarVocabularioDataset(['precio', 'ciudad', 'fecha_alta'])).toEqual(VOCABULARIO_NEUTRO);
  });

  test('columnas vacías devuelven el vocabulario neutro', () => {
    expect(detectarVocabularioDataset([])).toEqual(VOCABULARIO_NEUTRO);
  });

  test('detecta el dominio biología por nombre de columna exacto', () => {
    const vocabulario = detectarVocabularioDataset(['especie', 'peso_kg', 'habitat']);
    expect(vocabulario.dominio).toBe('biologia');
    expect(vocabulario.unidadSingular).toBe('espécimen');
    expect(vocabulario.unidadPlural).toBe('especímenes');
  });

  test('detecta el dominio dentro de un nombre de columna compuesto (token, no substring crudo)', () => {
    const vocabulario = detectarVocabularioDataset(['nombre_especie', 'fecha_captura']);
    expect(vocabulario.dominio).toBe('biologia');
  });

  test('no matchea una coincidencia de substring que no es un token real', () => {
    // "cliente" aparece como substring de "reclientelizacion" pero no como
    // token propio — no debe disparar el dominio comercial.
    const vocabulario = detectarVocabularioDataset(['reclientelizacion_score', 'fecha']);
    expect(vocabulario).toEqual(VOCABULARIO_NEUTRO);
  });

  test('detecta el dominio de ciencias sociales', () => {
    const vocabulario = detectarVocabularioDataset(['encuestado_id', 'edad', 'respuesta']);
    expect(vocabulario.dominio).toBe('cienciasSociales');
    expect(vocabulario.unidadSingular).toBe('encuestado');
  });

  test('detecta el dominio comercial', () => {
    const vocabulario = detectarVocabularioDataset(['cliente_id', 'producto', 'venta_total']);
    expect(vocabulario.dominio).toBe('comercial');
    expect(vocabulario.unidadSingular).toBe('cliente');
  });

  test('ignora mayúsculas y acentos al comparar', () => {
    const vocabulario = detectarVocabularioDataset(['ESPÉCIMEN', 'Peso']);
    expect(vocabulario.dominio).toBe('biologia');
  });

  test('un empate entre dos dominios cae al vocabulario neutro, no adivina', () => {
    // 1 coincidencia de biología ("especie") y 1 de comercial ("cliente") —
    // empate, ningún dominio gana con evidencia estrictamente mayor.
    const vocabulario = detectarVocabularioDataset(['especie', 'cliente']);
    expect(vocabulario).toEqual(VOCABULARIO_NEUTRO);
  });

  test('con más coincidencias de un dominio que de otro, gana el que tiene más evidencia', () => {
    const vocabulario = detectarVocabularioDataset(['especie', 'muestra', 'organismo', 'cliente']);
    expect(vocabulario.dominio).toBe('biologia');
  });
});
