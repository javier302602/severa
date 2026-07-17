import { inferirTipoColumna, esNumerico, esFecha, esVacio, calzaConTipo } from '../../src/domain/services/DetectorDeTipoDeColumna';

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
});
