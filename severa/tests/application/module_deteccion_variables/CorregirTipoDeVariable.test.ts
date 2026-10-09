import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { CalcularEstadisticasDescriptivasGenerico } from '../../../src/application/usecases/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenerico';
import { CalcularMatrizCorrelacionGenerico } from '../../../src/application/usecases/module_medidas_tendencia_dispersion/CalcularMatrizCorrelacionGenerico';
import { DetectarOutliersGenerico } from '../../../src/application/usecases/module_limpieza_calidad_datos/DetectarOutliersGenerico';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { ColumnaDeDatasetInvalidaError } from '../../../src/domain/errors/ColumnaDeDatasetInvalidaError';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { SesionSinDatasetError } from '../../../src/domain/errors/SesionSinDatasetError';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';

// RF-111 (M-14, Ronda 2). Criterios de aceptación del SDS:
//   - El analista puede cambiar el tipo detectado de cualquier variable.
//   - El sistema recalcula los análisis dependientes.
//   - El cambio queda registrado en la bitácora de trazabilidad (RF-123).
const COLUMNAS = {
  cp: [15001, 15003, 15001, 15036, 15003, 15001, 15036, 15074, 15001, 15003],
  monto: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5],
  sede: ['norte', 'sur', 'centro', 'norte', 'sur', 'centro', 'norte', 'sur', 'centro', 'norte']
};

async function preparar() {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
  return { repositorio, store, ...cargado, usecase: new CorregirTipoDeVariable(store, repositorio) };
}

describe('RF-111 — corregir el tipo de una variable', () => {
  test('fija el tipo, lo guarda en el dataset y en la sesión, y devuelve los análisis ya recalculados', async () => {
    const { repositorio, store, usecase, sesionId, datasetId } = await preparar();

    const resultado = await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');

    expect(resultado).toMatchObject({
      huboCambio: true,
      columna: 'cp',
      tipoAnterior: 'numerica_discreta',
      tipoVigente: 'categorica_nominal',
      tipoDetectado: 'numerica_discreta',
      tiposCorregidos: { cp: 'categorica_nominal' },
      datasetOriginalId: datasetId,
      nombreArchivo: 'encuesta.csv',
      version: 0
    });
    // Recalculados: el diagnóstico y el perfil ya la tratan como categórica.
    expect(resultado.diagnostico.columnas[0]).toMatchObject({ nombre: 'cp', tipo: 'categorica', tipoCorregidoManualmente: true });
    expect(resultado.perfilVariables[0]).toMatchObject({ nombre: 'cp', tipo: 'categorica', valoresUnicos: 4 });

    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.tiposCorregidos).toEqual({ cp: 'categorica_nominal' });
    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toEqual({ cp: 'categorica_nominal' });
  });

  test('"se aplica a todos los análisis posteriores": los demás casos de uso de la misma sesión la respetan', async () => {
    const { store, usecase, sesionId } = await preparar();
    const descriptivas = new CalcularEstadisticasDescriptivasGenerico(store);
    const correlacion = new CalcularMatrizCorrelacionGenerico(store);
    const atipicos = new DetectarOutliersGenerico(store);

    expect((await correlacion.ejecutar('analista-A', sesionId)).columnas).toEqual(['cp', 'monto']);

    await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');

    expect((await descriptivas.ejecutar('analista-A', sesionId))[0]).toMatchObject({ nombre: 'cp', tipo: 'categorica' });
    expect((await correlacion.ejecutar('analista-A', sesionId)).columnas).toEqual(['monto']);
    expect((await atipicos.ejecutar('analista-A', sesionId)).columnas.map((columna) => columna.columna)).toEqual(['monto']);
  });

  test('deja una entrada en la bitácora con el tipo anterior y el nuevo', async () => {
    const { repositorio, usecase, sesionId, datasetId } = await preparar();

    await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');

    const bitacora = await repositorio.listarBitacora(datasetId, 'analista-A');
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0]).toMatchObject({
      operacion: 'corregir_tipo',
      variable: 'cp',
      registrosAfectados: 10,
      metodo: 'manual',
      versionOrigen: 0,
      // Corregir un tipo no cambia los datos: no genera una versión nueva.
      versionResultado: null,
      detalle: { tipoAnterior: 'numerica_discreta', tipoNuevo: 'categorica_nominal', tipoDetectado: 'numerica_discreta' }
    });
  });

  test('con tipo null vuelve a la detección automática, y también queda en la bitácora', async () => {
    const { repositorio, store, usecase, sesionId, datasetId } = await preparar();
    await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');

    const resultado = await usecase.ejecutar('analista-A', sesionId, 'cp', null);

    expect(resultado).toMatchObject({ huboCambio: true, tipoAnterior: 'categorica_nominal', tipoVigente: 'numerica_discreta', tiposCorregidos: {} });
    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toEqual({});
    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.tiposCorregidos).toEqual({});
    const bitacora = await repositorio.listarBitacora(datasetId, 'analista-A');
    expect(bitacora.map((entrada) => entrada.metodo)).toEqual(['manual', 'manual (vuelve al tipo detectado)']);
  });

  test('elegir el mismo tipo que ya se detectó equivale a no corregir: no se anota como corrección', async () => {
    const { repositorio, usecase, sesionId, datasetId } = await preparar();

    const resultado = await usecase.ejecutar('analista-A', sesionId, 'cp', 'numerica_discreta');

    expect(resultado).toMatchObject({ huboCambio: false, tiposCorregidos: {} });
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('repetir la misma corrección no duplica la entrada de bitácora', async () => {
    const { repositorio, usecase, sesionId, datasetId } = await preparar();

    await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');
    const segunda = await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');

    expect(segunda.huboCambio).toBe(false);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toHaveLength(1);
  });

  test('las correcciones de otras columnas se conservan', async () => {
    const { usecase, sesionId } = await preparar();

    await usecase.ejecutar('analista-A', sesionId, 'cp', 'categorica_nominal');
    const resultado = await usecase.ejecutar('analista-A', sesionId, 'sede', 'texto_libre');

    expect(resultado.tiposCorregidos).toEqual({ cp: 'categorica_nominal', sede: 'texto_libre' });
  });
});

describe('RF-111 — correcciones que no se pueden aplicar', () => {
  test('una columna que no existe', async () => {
    const { usecase, sesionId } = await preparar();

    await expect(usecase.ejecutar('analista-A', sesionId, 'peso', 'numerica_continua')).rejects.toThrow(
      new ColumnaDeDatasetInvalidaError('La columna "peso" no existe en este dataset')
    );
  });

  test('un tipo que los valores no admiten: lo rechaza y explica por qué, sin guardar nada', async () => {
    const { repositorio, store, usecase, sesionId, datasetId } = await preparar();

    await expect(usecase.ejecutar('analista-A', sesionId, 'sede', 'numerica_continua')).rejects.toThrow(
      new ColumnaDeDatasetInvalidaError('No se puede tratar "sede" como numérica continua: ninguno de sus valores es un número.')
    );
    await expect(usecase.ejecutar('analista-A', sesionId, 'monto', 'numerica_discreta')).rejects.toThrow('tiene valores con decimales');

    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toBeUndefined();
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });
});

describe('RF-111 — a quién le pertenece la sesión', () => {
  test('la sesión de otro analista responde igual que una que no existe', async () => {
    const { repositorio, usecase, sesionId, datasetId } = await preparar();

    await expect(usecase.ejecutar('analista-B', sesionId, 'cp', 'categorica_nominal')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    await expect(usecase.ejecutar('analista-A', 'sesion-inexistente', 'cp', 'categorica_nominal')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.tiposCorregidos).toEqual({});
  });

  test('una sesión sin dataset guardado no tiene dónde persistir la corrección', async () => {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a'], filas: [{ a: 1 }] });

    await expect(new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'a', 'categorica_nominal')).rejects.toThrow(
      SesionSinDatasetError
    );
  });

  test('si el dataset de la sesión ya no existe, lo dice', async () => {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a'], filas: [{ a: 1 }], datasetId: 'borrado' });

    await expect(new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'a', 'categorica_nominal')).rejects.toThrow(
      DatasetGenericoNoEncontradoError
    );
  });
});
