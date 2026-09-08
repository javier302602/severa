import { AnalizarCalidadDatasetGenerico } from '../../../src/application/usecases/module_limpieza_calidad_datos/AnalizarCalidadDatasetGenerico';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { ColumnaDeDatasetInvalidaError } from '../../../src/domain/errors/ColumnaDeDatasetInvalidaError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

// M-15 (RF-114/RF-116/RF-117), Ronda 1. El detalle de CADA cálculo
// (esValorFaltante, detectarFilasDuplicadas, validarRango) ya está probado a
// fondo en CalidadDeDatosGenerico.test.ts — acá se prueba la plomería propia
// del caso de uso: defaults, validación de parámetros, y que delega
// correctamente en las funciones de dominio.
describe('AnalizarCalidadDatasetGenerico — M-15 Ronda 1', () => {
  const datosDePrueba = {
    columnas: ['id', 'nombre', 'edad'],
    filas: [
      { id: '1', nombre: 'Ana', edad: 25 },
      { id: '2', nombre: 'Ana', edad: 25 },
      { id: '3', nombre: 'Beto', edad: -5 }
    ]
  };

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError', async () => {
    const store = storeFalso(undefined);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', {})).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });

  test('sin opciones, usa umbralFilaIncompleta=50 y columnasClave=todas las columnas', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', {});

    expect(resultado.filasIncompletas.umbralPorcentaje).toBe(50);
    expect(resultado.duplicados.columnasClave).toEqual(['id', 'nombre', 'edad']);
    // Fila 0 y 1 son exactamente iguales (id distinto haría que no lo sean,
    // pero acá difieren en id) -> con TODAS las columnas como clave, no hay
    // duplicados exactos.
    expect(resultado.duplicados.totalFilasDuplicadas).toBe(0);
    expect(resultado.validacionRango).toBeUndefined();
    expect(resultado.diagnostico.totalFilas).toBe(3);
  });

  test('respeta un umbralFilaIncompleta explícito', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', { umbralFilaIncompleta: 10 });
    expect(resultado.filasIncompletas.umbralPorcentaje).toBe(10);
  });

  test('rechaza un umbralFilaIncompleta fuera de [0, 100]', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', { umbralFilaIncompleta: 150 })).rejects.toThrow();
    await expect(useCase.ejecutar('analista-A', 'sesion-1', { umbralFilaIncompleta: -1 })).rejects.toThrow();
  });

  test('con columnasClave = ["nombre", "edad"], detecta el duplicado que la comparación completa no ve', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', { columnasClave: ['nombre', 'edad'] });

    expect(resultado.duplicados.columnasClave).toEqual(['nombre', 'edad']);
    expect(resultado.duplicados.totalFilasDuplicadas).toBe(1);
  });

  test('columnasClave con una columna inexistente tira ColumnaDeDatasetInvalidaError', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', { columnasClave: ['no-existe'] })).rejects.toThrow(
      ColumnaDeDatasetInvalidaError
    );
  });

  test('rangoColumna que no existe tira ColumnaDeDatasetInvalidaError', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(
      useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'no-existe', rangoMinimo: 0, rangoMaximo: 10 })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rangoColumna que no es numérica tira ColumnaDeDatasetInvalidaError', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(
      useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'nombre', rangoMinimo: 0, rangoMaximo: 10 })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rangoColumna sin rangoMinimo/rangoMaximo tira error de validación', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'edad' })).rejects.toThrow();
  });

  test('rangoMinimo/rangoMaximo no finitos (ej. NaN de un query param mal formado) tiran error de validación', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(
      useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'edad', rangoMinimo: NaN, rangoMaximo: 10 })
    ).rejects.toThrow();
  });

  test('rangoMinimo mayor que rangoMaximo tira error de validación', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    await expect(
      useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'edad', rangoMinimo: 100, rangoMaximo: 0 })
    ).rejects.toThrow();
  });

  test('con un rango válido sobre una columna numérica, devuelve la validación de rango', async () => {
    const store = storeFalso(datosDePrueba);
    const useCase = new AnalizarCalidadDatasetGenerico(store);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', { rangoColumna: 'edad', rangoMinimo: 0, rangoMaximo: 120 });

    expect(resultado.validacionRango).toBeDefined();
    expect(resultado.validacionRango!.columna).toBe('edad');
    expect(resultado.validacionRango!.cantidadFueraDeRango).toBe(1); // -5
  });
});
