import { AnalizarColumnaUnivariadoGenerico } from '../../src/application/usecases/AnalizarColumnaUnivariadoGenerico';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetInvalidoError } from '../../src/domain/errors/DatasetInvalidoError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

describe('AnalizarColumnaUnivariadoGenerico — Mejora 4 (Análisis de Datos General) Fase 3', () => {
  test('delega en el store y analiza la columna pedida sobre los datos de la sesión', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const useCase = new AnalizarColumnaUnivariadoGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', 'precio');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.nombre).toBe('precio');
    expect(resultado.tipo).toBe('numerica');
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError (no llega a analizar nada)', async () => {
    const store = storeFalso(undefined);
    const useCase = new AnalizarColumnaUnivariadoGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', 'precio')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });

  test('si la columna pedida no existe en el dataset de la sesión, tira DatasetInvalidoError', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }] });
    const useCase = new AnalizarColumnaUnivariadoGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', 'noExiste')).rejects.toThrow(DatasetInvalidoError);
  });
});
