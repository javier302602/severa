import { GenerarHistogramaDeTiempoGenerico } from '../../../src/application/usecases/module_visualizacion_grafica/GenerarHistogramaDeTiempoGenerico';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetInvalidoError } from '../../../src/domain/errors/DatasetInvalidoError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

describe('GenerarHistogramaDeTiempoGenerico — RF-58 (M-07, genérico)', () => {
  test('columna de tipo fecha: devuelve un SVG real y una interpretación con el rango de fechas', async () => {
    const filas = [
      { fecha: '2024-01-15' },
      { fecha: '2024-01-15' },
      { fecha: '2024-03-10' }
    ];
    const store = storeFalso({ columnas: ['fecha'], filas });
    const useCase = new GenerarHistogramaDeTiempoGenerico(store);

    const resultado = (await useCase.ejecutar('analista-A', 'sesion-1', 'fecha')) as { svg: string; interpretacion: string };

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.svg).toContain('<svg');
    expect(resultado.svg).toContain('<rect');
    expect(resultado.interpretacion).toContain('2024-01-15');
  });

  test('formato=json devuelve el análisis crudo (mismo shape que el univariado)', async () => {
    const filas = [{ fecha: '2024-01-15' }, { fecha: '2024-03-10' }];
    const store = storeFalso({ columnas: ['fecha'], filas });
    const useCase = new GenerarHistogramaDeTiempoGenerico(store);

    const resultado = (await useCase.ejecutar('analista-A', 'sesion-1', 'fecha', 'json')) as { tipo: string };

    expect(resultado.tipo).toBe('fecha');
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError (mismo criterio IDOR de siempre)', async () => {
    const store = storeFalso(undefined);
    const useCase = new GenerarHistogramaDeTiempoGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', 'fecha')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });

  test('si la columna pedida no es de tipo fecha, tira DatasetInvalidoError con mensaje claro', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const useCase = new GenerarHistogramaDeTiempoGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', 'precio')).rejects.toThrow(DatasetInvalidoError);
    await expect(useCase.ejecutar('analista-A', 'sesion-1', 'precio')).rejects.toThrow('no es de tipo fecha/tiempo');
  });

  test('si la columna pedida no existe en el dataset, tira DatasetInvalidoError (mismo criterio que univariado)', async () => {
    const store = storeFalso({ columnas: ['fecha'], filas: [{ fecha: '2024-01-15' }] });
    const useCase = new GenerarHistogramaDeTiempoGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', 'noExiste')).rejects.toThrow(DatasetInvalidoError);
  });
});
