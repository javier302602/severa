import { CriterioDeClasificacionValue } from '../../../../src/domain/shared/value-objects/CriterioDeClasificacion';

describe('CriterioDeClasificacionValue', () => {
  describe('numerica', () => {
    const criterio = CriterioDeClasificacionValue.numerica('Puntaje', [
      { minimo: 0, etiqueta: 'Bajo' },
      { minimo: 9, etiqueta: 'Crítico' },
      { minimo: 7, etiqueta: 'Alto' },
      { minimo: 4, etiqueta: 'Moderado' }
    ]);

    test('ordena los umbrales descendente sin importar el orden de entrada', () => {
      expect(criterio.umbrales).toEqual([
        { minimo: 9, etiqueta: 'Crítico' },
        { minimo: 7, etiqueta: 'Alto' },
        { minimo: 4, etiqueta: 'Moderado' },
        { minimo: 0, etiqueta: 'Bajo' }
      ]);
    });

    test.each([
      [9.5, 'Crítico'],
      [9, 'Crítico'],
      [8.9, 'Alto'],
      [7, 'Alto'],
      [6.9, 'Moderado'],
      [4, 'Moderado'],
      [3.9, 'Bajo'],
      [0, 'Bajo']
    ])('clasifica %f como %s (mismo algoritmo que NivelDeRiesgoValue.desde)', (valor, esperado) => {
      expect(criterio.clasificar(valor)).toBe(esperado);
    });

    test('acepta el valor como string numérico (tal como puede venir de un dataset)', () => {
      expect(criterio.clasificar('9.5')).toBe('Crítico');
    });

    test('valor no numérico o vacío cae en "Sin clasificar", no lanza', () => {
      expect(criterio.clasificar('N/A')).toBe('Sin clasificar');
      expect(criterio.clasificar(undefined)).toBe('Sin clasificar');
      expect(criterio.clasificar(null)).toBe('Sin clasificar');
    });

    test('un valor por debajo de todos los umbrales (sin umbral en 0) cae en "Sin clasificar"', () => {
      const sinPiso = CriterioDeClasificacionValue.numerica('Puntaje', [{ minimo: 5, etiqueta: 'Alto' }]);
      expect(sinPiso.clasificar(2)).toBe('Sin clasificar');
    });
  });

  describe('ordinal', () => {
    const criterio = CriterioDeClasificacionValue.ordinal('Prioridad', ['Baja', 'Media', 'Alta']);

    test('clasifica devolviendo la misma etiqueta que trae la categoría', () => {
      expect(criterio.clasificar('Alta')).toBe('Alta');
      expect(criterio.clasificar('Baja')).toBe('Baja');
    });

    test('una categoría fuera del orden declarado cae en "Sin clasificar"', () => {
      expect(criterio.clasificar('Urgentísima')).toBe('Sin clasificar');
    });

    test('coacciona valores no-string a texto antes de comparar', () => {
      const criterioNumerico = CriterioDeClasificacionValue.ordinal('Nivel', ['1', '2', '3']);
      expect(criterioNumerico.clasificar(2)).toBe('2');
    });
  });

  describe('serialización JSON (persistencia en datasets_genericos.criterio_clasificacion)', () => {
    test('toJSON/desdeJSON hacen un roundtrip completo para un criterio numérico', () => {
      const original = CriterioDeClasificacionValue.numerica('Riesgo', [
        { minimo: 8, etiqueta: 'Alto' },
        { minimo: 0, etiqueta: 'Bajo' }
      ]);

      const reconstruido = CriterioDeClasificacionValue.desdeJSON(original.toJSON());

      expect(reconstruido.clasificar(9)).toBe('Alto');
      expect(reconstruido.clasificar(1)).toBe('Bajo');
      expect(reconstruido.nombreColumna).toBe('Riesgo');
      expect(reconstruido.tipo).toBe('numerica');
    });

    test('toJSON/desdeJSON hacen un roundtrip completo para un criterio ordinal', () => {
      const original = CriterioDeClasificacionValue.ordinal('Categoría', ['Baja', 'Alta']);
      const reconstruido = CriterioDeClasificacionValue.desdeJSON(original.toJSON());

      expect(reconstruido.clasificar('Alta')).toBe('Alta');
      expect(reconstruido.tipo).toBe('ordinal');
    });
  });
});
