import { DetectarOutliersGenerico } from '../../src/application/usecases/DetectarOutliersGenerico';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../src/domain/errors/SesionAnalisisNoEncontradaError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

describe('DetectarOutliersGenerico — Mejora 4 (Análisis de Datos General) Fase 4', () => {
  test('delega en el store pasando analistaId y sesionId, y detecta atípicos sobre los datos devueltos', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [10, 12, 11, 13, 12, 100].map((precio) => ({ precio })) });
    const useCase = new DetectarOutliersGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.columnas[0].cantidadValoresAtipicos).toBe(1);
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError', async () => {
    const store = storeFalso(undefined);
    const useCase = new DetectarOutliersGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
