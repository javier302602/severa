import { ListarDatasetsGenericos } from '../../../src/application/usecases/module_carga_gestion_datasets/ListarDatasetsGenericos';
import { ListarVersionesDeDataset } from '../../../src/application/usecases/module_carga_gestion_datasets/ListarVersionesDeDataset';
import { AbrirDatasetGenerico } from '../../../src/application/usecases/module_carga_gestion_datasets/AbrirDatasetGenerico';
import { ExportarDatasetGenerico } from '../../../src/application/usecases/module_carga_gestion_datasets/ExportarDatasetGenerico';
import { AplicarLimpiezaDeDataset } from '../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { DefinirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';

// RF-136 (M-12): "el sistema mantiene versiones numeradas de cada dataset
// procesado. El analista puede consultar y recuperar versiones anteriores."
const COLUMNAS = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, null, ''],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, 'Lima', 'Cusco']
};

async function preparar() {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
  return {
    repositorio,
    store,
    ...cargado,
    limpiar: new AplicarLimpiezaDeDataset(store, repositorio),
    listar: new ListarDatasetsGenericos(repositorio),
    versiones: new ListarVersionesDeDataset(repositorio),
    abrir: new AbrirDatasetGenerico(repositorio, store)
  };
}

describe('RF-136 — consultar: los datasets del analista', () => {
  test('uno por archivo cargado, con cuántas versiones procesadas tiene y cuál es la última', async () => {
    const { repositorio, store, limpiar, listar, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);
    const v2 = await limpiar.ejecutar('analista-A', v1.sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);
    const otro = await cargarDatasetDePrueba(repositorio, store, {
      nombreArchivo: 'ventas.xlsx',
      columnas: { monto: [1, 2, 3] },
      fechaCarga: new Date('2026-04-01T10:00:00Z')
    });

    const datasets = await listar.ejecutar('analista-A');

    // El más reciente primero. Las versiones no aparecen como datasets aparte.
    expect(datasets).toHaveLength(2);
    expect(datasets[0]).toMatchObject({
      datasetOriginalId: otro.datasetId,
      nombreArchivo: 'ventas.xlsx',
      totalFilas: 3,
      totalColumnas: 1,
      versionesProcesadas: 0,
      ultimaVersion: { datasetId: otro.datasetId, version: 0 }
    });
    expect(datasets[1]).toMatchObject({
      datasetOriginalId: datasetId,
      nombreArchivo: 'encuesta.csv',
      totalFilas: 10,
      totalColumnas: 2,
      versionesProcesadas: 2,
      ultimaVersion: { datasetId: v2.datasetId, version: 2 }
    });
  });

  test('cada analista ve solo los suyos', async () => {
    const { repositorio, store, listar } = await preparar();
    await cargarDatasetDePrueba(repositorio, store, { analistaId: 'analista-B', nombreArchivo: 'ajeno.csv', columnas: { x: [1, 2] } });

    expect((await listar.ejecutar('analista-A')).map((dataset) => dataset.nombreArchivo)).toEqual(['encuesta.csv']);
    expect((await listar.ejecutar('analista-B')).map((dataset) => dataset.nombreArchivo)).toEqual(['ajeno.csv']);
    expect(await listar.ejecutar('analista-C')).toEqual([]);
  });
});

describe('RF-136 — consultar: las versiones de un dataset', () => {
  test('lista el original y cada versión, con las operaciones que la generaron', async () => {
    const { limpiar, versiones, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ], true);

    const lista = await versiones.ejecutar('analista-A', datasetId);

    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ datasetId, version: 0, versionBase: null, esOriginal: true, totalFilas: 10, totalColumnas: 2, operaciones: [] });
    expect(lista[1]).toMatchObject({ datasetId: v1.datasetId, version: 1, versionBase: 0, esOriginal: false, totalFilas: 9, totalColumnas: 2 });
    expect(lista[1].operaciones).toEqual([
      { operacion: 'eliminar_registros', variable: 'ciudad', metodo: 'eliminación de filas con el valor faltante', registrosAfectados: 1 },
      { operacion: 'imputar', variable: 'edad', metodo: 'media', registrosAfectados: 2 }
    ]);
  });

  test('se puede pedir con el id de cualquier versión de la familia', async () => {
    const { limpiar, versiones, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);

    expect(await versiones.ejecutar('analista-A', v1.datasetId)).toEqual(await versiones.ejecutar('analista-A', datasetId));
  });

  test('las operaciones que no generan versión (corregir un tipo, definir la variable objetivo) no se le atribuyen a ninguna', async () => {
    const { repositorio, store, versiones, sesionId, datasetId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, 'ciudad');

    const lista = await versiones.ejecutar('analista-A', datasetId);

    expect(lista).toHaveLength(1);
    expect(lista[0].operaciones).toEqual([]);
  });

  test('las versiones de un dataset ajeno no se pueden consultar', async () => {
    const { versiones, datasetId } = await preparar();

    await expect(versiones.ejecutar('analista-B', datasetId)).rejects.toThrow(DatasetGenericoNoEncontradoError);
    await expect(versiones.ejecutar('analista-A', 'no-existe')).rejects.toThrow(DatasetGenericoNoEncontradoError);
  });
});

describe('RF-136 — recuperar una versión anterior', () => {
  test('abrir el original después de haberlo limpiado devuelve los datos tal como se cargaron', async () => {
    const { store, limpiar, abrir, sesionId, datasetId, filas } = await preparar();
    await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'eliminar_registros' }], true);

    const abierto = await abrir.ejecutar('analista-A', datasetId);

    expect(abierto).toMatchObject({ datasetId, datasetOriginalId: datasetId, version: 0, versionBase: null, nombreArchivo: 'encuesta.csv' });
    expect(abierto.diagnostico.totalFilas).toBe(10);
    expect(store.obtener('analista-A', abierto.sesionId)).toEqual({ columnas: ['edad', 'ciudad'], filas, datasetId, tiposCorregidos: {} });
  });

  test('abrir una versión procesada devuelve sus datos, no los del original', async () => {
    const { store, limpiar, abrir, sesionId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);

    const abierto = await abrir.ejecutar('analista-A', v1.datasetId);

    expect(abierto).toMatchObject({ datasetId: v1.datasetId, version: 1, versionBase: 0 });
    expect(abierto.sesionId).not.toBe(v1.sesionId);
    expect(store.obtener('analista-A', abierto.sesionId)?.filas.map((fila) => fila.edad)).toEqual([20, 25, 30, 35, 40, 22, 38, 30, 30, 30]);
    expect(abierto.diagnostico).toEqual(v1.diagnostico);
  });

  test('abrir no crea versiones ni escribe en la bitácora', async () => {
    const { repositorio, abrir, datasetId } = await preparar();

    await abrir.ejecutar('analista-A', datasetId);
    await abrir.ejecutar('analista-A', datasetId);

    expect(await repositorio.listarVersiones(datasetId, 'analista-A')).toHaveLength(1);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('se recupera con lo que el analista había configurado: tipos corregidos y variable objetivo', async () => {
    const { repositorio, store, abrir, sesionId, datasetId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, 'ciudad');

    const abierto = await abrir.ejecutar('analista-A', datasetId);

    expect(abierto.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
    expect(abierto.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'ciudad' });
    expect(abierto.diagnostico.columnas[0]).toMatchObject({ nombre: 'edad', tipo: 'categorica', tipoCorregidoManualmente: true });
    expect(store.obtener('analista-A', abierto.sesionId)?.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
  });

  test('un dataset ajeno no se puede abrir, y no queda ninguna sesión creada', async () => {
    const { store, abrir, datasetId } = await preparar();
    const crear = jest.spyOn(store, 'crear');

    await expect(abrir.ejecutar('analista-B', datasetId)).rejects.toThrow(DatasetGenericoNoEncontradoError);
    await expect(abrir.ejecutar('analista-A', 'no-existe')).rejects.toThrow(DatasetGenericoNoEncontradoError);
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('RF-24 + RF-136 — exportar una versión', () => {
  test('exporta la versión pedida y dice cuál es', async () => {
    const { repositorio, limpiar, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'eliminar_registros' }], true);
    const exportar = new ExportarDatasetGenerico(repositorio);

    const original = await exportar.ejecutar(datasetId, 'analista-A');
    const procesada = await exportar.ejecutar(v1.datasetId, 'analista-A');

    expect(original).toMatchObject({ datasetOriginalId: datasetId, version: 0, totalFilas: 10, nombreArchivo: 'encuesta.csv' });
    expect(procesada).toMatchObject({ datasetOriginalId: datasetId, version: 1, totalFilas: 8, nombreArchivo: 'encuesta.csv' });
    expect(Buffer.isBuffer(procesada.contenido)).toBe(true);
  });
});
