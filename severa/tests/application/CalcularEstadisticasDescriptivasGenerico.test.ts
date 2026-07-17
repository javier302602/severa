import { CalcularEstadisticasDescriptivasGenerico } from '../../src/application/usecases/CalcularEstadisticasDescriptivasGenerico';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../src/domain/errors/SesionAnalisisNoEncontradaError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

describe('CalcularEstadisticasDescriptivasGenerico — Mejora 4 (Análisis de Datos General) Fase 3', () => {
  test('delega en el store pasando analistaId y sesionId, y calcula el resumen sobre los datos devueltos', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('precio');
  });

  test('si el store no encuentra la sesión (inexistente, expirada, o de otro analista), tira SesionAnalisisNoEncontradaError', async () => {
    const store = storeFalso(undefined);
    const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
