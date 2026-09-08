import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { VerificarIntegridadDataset } from '../../../src/application/usecases/module_carga_gestion_datasets/VerificarIntegridadDataset';
import { DatasetGenericoRepository } from '../../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../src/domain/entities/DatasetGenerico';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';

function repositorioFalso(dataset: DatasetGenerico | null): jest.Mocked<DatasetGenericoRepository> {
  return {
    guardar: jest.fn(),
    guardarRegistros: jest.fn(),
    buscarPorId: jest.fn().mockResolvedValue(dataset),
    listarRegistros: jest.fn(),
    actualizarCriterioClasificacion: jest.fn()
  };
}

function crearArchivoTemporal(contenido: string): string {
  const rutaArchivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'severa-verificar-integridad-test-')), 'archivo.xlsx');
  fs.writeFileSync(rutaArchivo, contenido);
  return rutaArchivo;
}

describe('VerificarIntegridadDataset', () => {
  test('coincide=true cuando el hash del archivo re-subido es igual al original', async () => {
    const contenido = 'contenido idéntico';
    const hashOriginal = createHash('sha256').update(contenido).digest('hex');
    const dataset = new DatasetGenerico('d1', 'analista-A', 'ventas.xlsx', ['Producto'], 'archivo', null, 0, new Date(), null, null, hashOriginal);
    const repository = repositorioFalso(dataset);
    const usecase = new VerificarIntegridadDataset(repository);
    const rutaArchivo = crearArchivoTemporal(contenido);

    const resultado = await usecase.ejecutar('d1', 'analista-A', rutaArchivo);

    expect(resultado).toEqual({ coincide: true, hashActual: hashOriginal, hashOriginal });
  });

  test('coincide=false cuando el archivo re-subido cambió respecto al original', async () => {
    const hashOriginal = createHash('sha256').update('contenido original').digest('hex');
    const dataset = new DatasetGenerico('d1', 'analista-A', 'ventas.xlsx', ['Producto'], 'archivo', null, 0, new Date(), null, null, hashOriginal);
    const repository = repositorioFalso(dataset);
    const usecase = new VerificarIntegridadDataset(repository);
    const rutaArchivo = crearArchivoTemporal('contenido alterado');

    const resultado = await usecase.ejecutar('d1', 'analista-A', rutaArchivo);

    expect(resultado.coincide).toBe(false);
    expect(resultado.hashOriginal).toBe(hashOriginal);
    expect(resultado.hashActual).not.toBe(hashOriginal);
  });

  test('coincide=false cuando el dataset no tiene hash original guardado (importado antes de la migración 013)', async () => {
    const dataset = new DatasetGenerico('d1', 'analista-A', 'ventas.xlsx', ['Producto'], 'archivo', null, 0, new Date(), null, null, null);
    const repository = repositorioFalso(dataset);
    const usecase = new VerificarIntegridadDataset(repository);
    const rutaArchivo = crearArchivoTemporal('cualquier contenido');

    const resultado = await usecase.ejecutar('d1', 'analista-A', rutaArchivo);

    expect(resultado.coincide).toBe(false);
    expect(resultado.hashOriginal).toBeNull();
  });

  test('lanza DatasetGenericoNoEncontradoError si el dataset no existe o es de otro analista', async () => {
    const repository = repositorioFalso(null);
    const usecase = new VerificarIntegridadDataset(repository);
    const rutaArchivo = crearArchivoTemporal('contenido');

    await expect(usecase.ejecutar('no-existe', 'analista-A', rutaArchivo)).rejects.toThrow(DatasetGenericoNoEncontradoError);
  });
});
