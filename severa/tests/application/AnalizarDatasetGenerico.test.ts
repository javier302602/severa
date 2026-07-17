import { AnalizarDatasetGenerico } from '../../src/application/usecases/AnalizarDatasetGenerico';
import { LectorDatasetGenerico } from '../../src/infrastructure/adapters/out/dataset-generico/LectorDatasetGenerico';
import { SesionAnalisisStore } from '../../src/application/ports/out/SesionAnalisisStore';

describe('AnalizarDatasetGenerico — Mejora 4 (Análisis de Datos General) Fase 2/3', () => {
  test('lee el archivo, calcula el diagnóstico y crea una sesión atada al analistaId recibido', async () => {
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }, { Producto: 'Mouse' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      obtener: jest.fn()
    };

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store);
    const resultado = await useCase.ejecutar('/tmp/archivo.xlsx', 'analista-A');

    expect(lector.leerArchivo).toHaveBeenCalledWith('/tmp/archivo.xlsx');
    expect(store.crear).toHaveBeenCalledWith('analista-A', datos);
    expect(resultado.sesionId).toBe('sesion-nueva-123');
    expect(resultado.diagnostico.totalFilas).toBe(2);
  });
});
