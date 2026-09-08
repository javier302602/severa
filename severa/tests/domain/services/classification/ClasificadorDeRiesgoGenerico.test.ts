import { clasificar } from '../../../../src/domain/services/classification/ClasificadorDeRiesgoGenerico';
import { CriterioDeClasificacionValue } from '../../../../src/domain/shared/value-objects/CriterioDeClasificacion';
import { RegistroDatasetGenerico } from '../../../../src/domain/entities/RegistroDatasetGenerico';

describe('ClasificadorDeRiesgoGenerico', () => {
  test('lee el valor de la columna configurada como criterio y delega en CriterioDeClasificacionValue', () => {
    const criterio = CriterioDeClasificacionValue.numerica('Puntaje', [
      { minimo: 8, etiqueta: 'Alto' },
      { minimo: 0, etiqueta: 'Bajo' }
    ]);
    const registro = new RegistroDatasetGenerico('r1', 'd1', 'analista-1', { Producto: 'Router', Puntaje: 9 });

    expect(clasificar(registro, criterio)).toBe('Alto');
  });

  test('ignora cualquier otra columna del registro, solo lee criterio.nombreColumna', () => {
    const criterio = CriterioDeClasificacionValue.ordinal('Prioridad', ['Baja', 'Alta']);
    const registro = new RegistroDatasetGenerico('r1', 'd1', 'analista-1', { Puntaje: 9.9, Prioridad: 'Baja' });

    expect(clasificar(registro, criterio)).toBe('Baja');
  });

  test('columna ausente en el registro se trata como valor vacío, no rompe', () => {
    const criterio = CriterioDeClasificacionValue.numerica('Puntaje', [{ minimo: 0, etiqueta: 'Bajo' }]);
    const registro = new RegistroDatasetGenerico('r1', 'd1', 'analista-1', { OtraColumna: 1 });

    expect(clasificar(registro, criterio)).toBe('Sin clasificar');
  });
});
