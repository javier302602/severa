import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { AnalizarDatasetGenerico } from '../../../src/application/usecases/module_carga_gestion_datasets/AnalizarDatasetGenerico';
import { LectorDatasetGenerico } from '../../../src/infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';

function datasetGenericoRepositoryFalso(): jest.Mocked<DatasetGenericoRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRegistros: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn(),
    listarRegistros: jest.fn(),
    actualizarTiposCorregidos: jest.fn().mockResolvedValue(undefined),
    actualizarVariableObjetivo: jest.fn().mockResolvedValue(undefined),
    listarTodos: jest.fn().mockResolvedValue([]),
    listarVersiones: jest.fn().mockResolvedValue([]),
    crearVersionProcesada: jest.fn(),
    registrarEnBitacora: jest.fn().mockResolvedValue(undefined),
    listarBitacora: jest.fn().mockResolvedValue([]),
    actualizarCriterioClasificacion: jest.fn().mockResolvedValue(undefined)
  };
}

// RF-135: calcularHashSha256Archivo (usado internamente por el caso de uso)
// lee el archivo real de disco por streaming — a diferencia de leerArchivo
// (mockeado, no toca el filesystem), esta parte SÍ necesita un archivo real
// en la ruta indicada, así que las rutas de prueba ya no pueden ser un path
// inventado como '/tmp/archivo.xlsx' que nunca existió.
function crearArchivoTemporal(contenido: string): string {
  const rutaArchivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'severa-hash-test-')), 'archivo.xlsx');
  fs.writeFileSync(rutaArchivo, contenido);
  return rutaArchivo;
}

describe('AnalizarDatasetGenerico — Mejora 4 (Análisis de Datos General) Fase 2/3, generalización de M-03', () => {
  test('lee el archivo, calcula el diagnóstico y crea una sesión atada al analistaId recibido', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }, { Producto: 'Mouse' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    const resultado = await useCase.ejecutar(rutaArchivo, 'analista-A', 'ventas.xlsx');

    expect(lector.leerArchivo).toHaveBeenCalledWith(rutaArchivo);
    // La sesión queda atada al dataset guardado: es lo que permite después
    // corregir tipos, limpiar y versionar sin volver a subir el archivo.
    expect(store.crear).toHaveBeenCalledWith('analista-A', { ...datos, datasetId: resultado.datasetId });
    expect(resultado.sesionId).toBe('sesion-nueva-123');
    expect(resultado.diagnostico.totalFilas).toBe(2);
  });

  test('persiste el dataset y sus registros (RF-17/21/23 generalizados)', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }, { Producto: 'Mouse' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    const resultado = await useCase.ejecutar(rutaArchivo, 'analista-A', 'ventas.xlsx');

    expect(resultado.datasetId).toEqual(expect.any(String));
    expect(datasetGenericoRepository.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: resultado.datasetId,
        analistaId: 'analista-A',
        nombreArchivo: 'ventas.xlsx',
        columnas: ['Producto'],
        fuente: 'archivo',
        preset: null,
        filasDuplicadas: 0,
        // RF-136: lo que se carga es siempre el original (versión 0) de una
        // familia nueva; las versiones procesadas nacen de una limpieza.
        esOriginal: true,
        version: 0,
        totalFilas: 2
      })
    );
    // `posicion` guarda el orden del archivo: sin ella, un dataset reabierto o
    // exportado salía con las filas en el orden de sus UUID.
    expect(datasetGenericoRepository.guardarRegistros).toHaveBeenCalledWith([
      expect.objectContaining({ datasetId: resultado.datasetId, analistaId: 'analista-A', valores: { Producto: 'Laptop' }, posicion: 0 }),
      expect.objectContaining({ datasetId: resultado.datasetId, analistaId: 'analista-A', valores: { Producto: 'Mouse' }, posicion: 1 })
    ]);
  });

  test('la posición sigue la numeración del archivo a través de los lotes, y la sesión se crea recién después de guardar', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const filas = Array.from({ length: 1001 }, (_, i) => ({ Producto: `Item ${i}` }));
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue({ columnas: ['Producto'], filas })
    };
    const orden: string[] = [];
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockImplementation(() => {
        orden.push('sesion');
        return 'sesion-1';
      }),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();
    datasetGenericoRepository.guardarRegistros.mockImplementation(async () => {
      orden.push('registros');
    });

    await new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository).ejecutar(
      rutaArchivo,
      'analista-A',
      'ventas.xlsx'
    );

    const segundoLote = datasetGenericoRepository.guardarRegistros.mock.calls[1][0];
    expect(segundoLote).toHaveLength(1);
    expect(segundoLote[0].posicion).toBe(1000);
    expect(orden).toEqual(['registros', 'registros', 'sesion']);
  });

  test('si guardar falla, no queda una sesión apuntando a un dataset que no existe', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue({ columnas: ['Producto'], filas: [{ Producto: 'Laptop' }] })
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn(),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();
    datasetGenericoRepository.guardarRegistros.mockRejectedValue(new Error('base caída'));

    await expect(
      new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository).ejecutar(
        rutaArchivo,
        'analista-A',
        'ventas.xlsx'
      )
    ).rejects.toThrow('base caída');
    expect(store.crear).not.toHaveBeenCalled();
  });

  test('divide los registros en lotes de 1000', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const filas = Array.from({ length: 2500 }, (_, i) => ({ Producto: `Item ${i}` }));
    const datos = { columnas: ['Producto'], filas };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    await useCase.ejecutar(rutaArchivo, 'analista-A', 'ventas.xlsx');

    expect(datasetGenericoRepository.guardarRegistros).toHaveBeenCalledTimes(3);
    expect((datasetGenericoRepository.guardarRegistros as jest.Mock).mock.calls[0][0]).toHaveLength(1000);
    expect((datasetGenericoRepository.guardarRegistros as jest.Mock).mock.calls[2][0]).toHaveLength(500);
  });

  // RF-135
  test('calcula el hash SHA-256 real del archivo original ANTES de parsearlo, y lo persiste con el dataset', async () => {
    const contenido = 'contenido conocido para hashear';
    const rutaArchivo = crearArchivoTemporal(contenido);
    const hashEsperado = createHash('sha256').update(contenido).digest('hex');
    const datos = { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    await useCase.ejecutar(rutaArchivo, 'analista-A', 'ventas.xlsx');

    expect(datasetGenericoRepository.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ hashOriginalSha256: hashEsperado })
    );
  });

  // RF-112
  test('devuelve perfilVariables (resumen min/max/moda por columna) junto al diagnóstico, en la misma respuesta', async () => {
    const rutaArchivo = crearArchivoTemporal('contenido de prueba');
    const datos = { columnas: ['Precio'], filas: [{ Precio: 10 }, { Precio: 20 }, { Precio: 30 }] };
    const lector: jest.Mocked<Pick<LectorDatasetGenerico, 'leerArchivo'>> = {
      leerArchivo: jest.fn().mockReturnValue(datos)
    };
    const store: jest.Mocked<SesionAnalisisStore> = {
      crear: jest.fn().mockReturnValue('sesion-nueva-123'),
      actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
      obtener: jest.fn()
    };
    const datasetGenericoRepository = datasetGenericoRepositoryFalso();

    const useCase = new AnalizarDatasetGenerico(lector as unknown as LectorDatasetGenerico, store, datasetGenericoRepository);
    const resultado = await useCase.ejecutar(rutaArchivo, 'analista-A', 'ventas.xlsx');

    expect(resultado.perfilVariables).toHaveLength(1);
    expect(resultado.perfilVariables[0]).toMatchObject({ tipo: 'numerica', nombre: 'Precio', minimo: 10, maximo: 30 });
  });
});
