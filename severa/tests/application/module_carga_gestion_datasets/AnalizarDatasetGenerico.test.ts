import { AnalizarDatasetGenerico } from '../../../src/application/usecases/module_carga_gestion_datasets/AnalizarDatasetGenerico';
import { LectorDatasetGenerico } from '../../../src/infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';

function datasetGenericoRepositoryFalso(): jest.Mocked<DatasetGenericoRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRegistros: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn(),
    listarRegistros: jest.fn()
  };
}

describe('AnalizarDatasetGenerico — Mejora 4 (Análisis de Datos General) Fase 2/3, generalización de M-03', () => {
  test('lee el archivo, calcula el diagnóstico y crea una sesión atada al analistaId recibido', async () => {
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }, { Producto: 'Mouse' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    const resultado = await useCase.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(lector.leerArchivo).toHaveBeenCalledWith('/tmp/archivo.xlsx');
    expect(store.crear).toHaveBeenCalledWith('analista-A', datos);
    expect(resultado.sesionId).toBe('sesion-nueva-123');
    expect(resultado.diagnostico.totalFilas).toBe(2);
  });

  test('persiste el dataset y sus registros (RF-17/21/23 generalizados)', async () => {
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }, { Producto: 'Mouse' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    const resultado = await useCase.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(resultado.datasetId).toEqual(expect.any(String));
    expect(datasetGenericoRepository.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: resultado.datasetId,
        analistaId: 'analista-A',
        nombreArchivo: 'ventas.xlsx',
        columnas: ['Producto'],
        fuente: 'archivo',
        preset: null,
        filasDuplicadas: 0
      })
    );
    expect(datasetGenericoRepository.guardarRegistros).toHaveBeenCalledWith([
      expect.objectContaining({ datasetId: resultado.datasetId, analistaId: 'analista-A', valores: { Producto: 'Laptop' } }),
      expect.objectContaining({ datasetId: resultado.datasetId, analistaId: 'analista-A', valores: { Producto: 'Mouse' } })
    ]);
  });

  test('divide los registros en lotes de 1000', async () => {
    const filas = Array.from({ length: 2500 }, (_, i) => ({ Producto: `Item ${i}` }));
    const datos = { columnas: ['Producto'], filas };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    await useCase.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(datasetGenericoRepository.guardarRegistros).toHaveBeenCalledTimes(3);
    expect((datasetGenericoRepository.guardarRegistros as jest.Mock).mock.calls[0][0]).toHaveLength(1000);
    expect((datasetGenericoRepository.guardarRegistros as jest.Mock).mock.calls[2][0]).toHaveLength(500);
  });
});
