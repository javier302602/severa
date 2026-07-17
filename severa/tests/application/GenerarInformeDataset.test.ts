import { GenerarInformeDataset } from '../../src/application/usecases/GenerarInformeDataset';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';
import { GeneradorDeInformes } from '../../src/application/ports/out/GeneradorDeInformes';
import { SesionAnalisisNoEncontradaError } from '../../src/domain/errors/SesionAnalisisNoEncontradaError';

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

function geradorDeInformesFalso(): jest.Mocked<GeneradorDeInformes> {
  return {
    generarInformeCompleto: jest.fn(),
    generarInformeWord: jest.fn(),
    generarResumenEjecutivo: jest.fn(),
    generarInformeDataset: jest.fn().mockResolvedValue(Buffer.from('pdf-falso')),
    generarInformeDatasetWord: jest.fn().mockResolvedValue(Buffer.from('docx-falso'))
  };
}

describe('GenerarInformeDataset — Mejora 4 (Análisis de Datos General) Fase 5', () => {
  test('formato pdf: delega en el store, arma el DTO y llama a generarInformeDataset', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', 'pdf');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.toString()).toBe('pdf-falso');
    expect(gerador.generarInformeDataset).toHaveBeenCalledTimes(1);
    expect(gerador.generarInformeDatasetWord).not.toHaveBeenCalled();

    const datosRecibidos = gerador.generarInformeDataset.mock.calls[0][0];
    expect(datosRecibidos.totalFilas).toBe(2);
  });

  test('formato docx: llama a generarInformeDatasetWord en vez de generarInformeDataset', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador);

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', 'docx');

    expect(resultado.toString()).toBe('docx-falso');
    expect(gerador.generarInformeDatasetWord).toHaveBeenCalledTimes(1);
    expect(gerador.generarInformeDataset).not.toHaveBeenCalled();
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError sin llamar al generador', async () => {
    const store = storeFalso(undefined);
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador);

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', 'pdf')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    expect(gerador.generarInformeDataset).not.toHaveBeenCalled();
  });
});
