import { CalcularMatrizCorrelacionGenerico } from '../../src/application/usecases/CalcularMatrizCorrelacionGenerico';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../src/domain/errors/SesionAnalisisNoEncontradaError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

describe('CalcularMatrizCorrelacionGenerico — Mejora 4 (Análisis de Datos General) Fase 4', () => {
  test('delega en el store pasando analistaId y sesionId, y calcula la matriz sobre los datos devueltos', async () => {
    const store = storeFalso({
      columnas: ['precio', 'cantidad'],
      filas: [10, 20, 30].map((precio) => ({ precio, cantidad: precio * 2 }))
    });
    const useCase = new CalcularMatrizCorrelacionGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.columnas.sort()).toEqual(['cantidad', 'precio']);
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError', async () => {
    const store = storeFalso(undefined);
    const useCase = new CalcularMatrizCorrelacionGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
