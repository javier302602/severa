import { CalcularEstadisticasDescriptivasGenerico } from '../../../src/application/usecases/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenerico';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';

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

  // M-14 (RF-109): por defecto, las columnas identificador quedan afuera.
  describe('RF-109 — incluirIdentificadores', () => {
    function datosConIdentificadorYNormal() {
      const filas = Array.from({ length: 10 }, (_, i) => ({ id: `EMP-${i}`, edad: 20 + i }));
      return { columnas: ['id', 'edad'], filas };
    }

    test('por defecto (sin pasar el parámetro), excluye las columnas identificador del resultado', async () => {
      const store = storeFalso(datosConIdentificadorYNormal());
      const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

      const resultado = await useCase.ejecutar('analista-A', 'sesion-1');

      expect(resultado.map((r) => r.nombre)).toEqual(['edad']);
    });

    test('con incluirIdentificadores=false explícito, mismo comportamiento que el default', async () => {
      const store = storeFalso(datosConIdentificadorYNormal());
      const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

      const resultado = await useCase.ejecutar('analista-A', 'sesion-1', false);

      expect(resultado.map((r) => r.nombre)).toEqual(['edad']);
    });

    test('con incluirIdentificadores=true, la columna identificador vuelve a aparecer', async () => {
      const store = storeFalso(datosConIdentificadorYNormal());
      const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

      const resultado = await useCase.ejecutar('analista-A', 'sesion-1', true);

      expect(resultado.map((r) => r.nombre).sort()).toEqual(['edad', 'id']);
    });

    test('sin ninguna columna identificador, incluirIdentificadores=false no descarta nada', async () => {
      const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
      const useCase = new CalcularEstadisticasDescriptivasGenerico(store);

      const resultado = await useCase.ejecutar('analista-A', 'sesion-1', false);

      expect(resultado.map((r) => r.nombre)).toEqual(['precio']);
    });
  });
});
