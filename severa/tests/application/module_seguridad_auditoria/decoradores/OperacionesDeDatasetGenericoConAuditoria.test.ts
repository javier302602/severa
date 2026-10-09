import {
  AplicarLimpiezaDeDatasetConAuditoria,
  CorregirTipoDeVariableConAuditoria,
  DefinirVariableObjetivoConAuditoria,
  ExportarDatasetGenericoConAuditoria
} from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/OperacionesDeDatasetGenericoConAuditoria';
import { AplicarLimpiezaDeDataset } from '../../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { CorregirTipoDeVariable } from '../../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { DefinirVariableObjetivo } from '../../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { ExportarDatasetGenerico } from '../../../../src/application/usecases/module_carga_gestion_datasets/ExportarDatasetGenerico';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { SesionAnalisisStoreEnMemoria } from '../../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { DatasetGenericoNoEncontradoError } from '../../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../../dobles/DatasetGenericoRepositoryEnMemoria';

// RF-138 (M-12): "centralizar en el módulo de seguridad y auditoría un
// registro de todas las operaciones relevantes sobre datasets (carga,
// limpieza, imputación, exportación, eliminación) con usuario, fecha y
// detalle". Y RF-122: una única notificación de resumen por limpieza.
//
// Los decoradores se prueban sobre los casos de uso reales (con el
// repositorio en memoria), para que el detalle auditado sea el de una
// operación de verdad y no el de un objeto armado a mano.
const COLUMNAS = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, null, ''],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, 'Lima', 'Cusco'],
  notas: [null, null, null, null, null, null, null, null, null, 'x']
};

function auditoriaFalsa(): jest.Mocked<AuditoriaRepository> {
  return { registrar: jest.fn().mockResolvedValue(undefined), listar: jest.fn().mockResolvedValue([]) };
}

function notificacionesFalsas(): jest.Mocked<Pick<ServicioDeNotificaciones, 'notificarLimpiezaCompletada'>> {
  return { notificarLimpiezaCompletada: jest.fn().mockResolvedValue(undefined) };
}

async function preparar() {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
  const auditoria = auditoriaFalsa();
  const notificaciones = notificacionesFalsas();
  return {
    repositorio,
    store,
    auditoria,
    notificaciones,
    ...cargado,
    limpiar: new AplicarLimpiezaDeDatasetConAuditoria(
      new AplicarLimpiezaDeDataset(store, repositorio),
      auditoria,
      notificaciones as unknown as ServicioDeNotificaciones
    )
  };
}

describe('RF-138 — limpieza e imputación', () => {
  test('una limpieza con imputaciones deja dos registros: la limpieza y la imputación, los dos con el dataset original', async () => {
    const { auditoria, limpiar, sesionId, datasetId } = await preparar();

    await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' },
      { columna: 'notas', estrategia: 'eliminar_columna' }
    ], true);

    expect(auditoria.registrar.mock.calls.map(([registro]) => registro)).toEqual([
      {
        usuario: 'analista-A',
        accion: 'LimpiarDatasetGenerico',
        detalle: 'Versión 1 de "encuesta.csv" generada desde la versión 0: 1 fila(s) eliminada(s), 1 columna(s) eliminada(s), 2 valor(es) imputado(s)',
        datasetId
      },
      {
        usuario: 'analista-A',
        accion: 'ImputarDatasetGenerico',
        detalle: 'Versión 1 de "encuesta.csv": edad (media, 2 valor(es))',
        datasetId
      }
    ]);
  });

  test('una limpieza sin imputaciones deja solo el registro de limpieza', async () => {
    const { auditoria, limpiar, sesionId } = await preparar();

    await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'ciudad', estrategia: 'eliminar_registros' }], true);

    expect(auditoria.registrar.mock.calls.map(([registro]) => registro.accion)).toEqual(['LimpiarDatasetGenerico']);
  });

  test('la limpieza de una versión se audita contra el dataset ORIGINAL, para que su auditoría quede junta', async () => {
    const { auditoria, limpiar, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'mediana' }], true);
    auditoria.registrar.mockClear();

    await limpiar.ejecutar('analista-A', v1.sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);

    expect(v1.datasetId).not.toBe(datasetId);
    auditoria.registrar.mock.calls.forEach(([registro]) => {
      expect(registro.datasetId).toBe(datasetId);
    });
    expect(auditoria.registrar.mock.calls[0][0].detalle).toMatch(/^Versión 2 de "encuesta.csv" generada desde la versión 1:/);
  });

  test('una limpieza rechazada (sin confirmar, o inválida) no se audita ni se notifica', async () => {
    const { auditoria, notificaciones, limpiar, sesionId } = await preparar();

    await expect(limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], false)).rejects.toThrow();
    await expect(limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'moda' }], true)).rejects.toThrow();

    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(notificaciones.notificarLimpiezaCompletada).not.toHaveBeenCalled();
  });

  test('la vista previa no guarda nada: no se audita ni se notifica', async () => {
    const { auditoria, notificaciones, limpiar, sesionId } = await preparar();

    const resumen = await limpiar.previsualizar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }]);

    expect(resumen.celdasImputadas).toBe(2);
    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(notificaciones.notificarLimpiezaCompletada).not.toHaveBeenCalled();
  });
});

// RF-122: "al finalizar un proceso de limpieza, el sistema emite una única
// notificación de resumen: registros afectados, columnas afectadas y método
// usado por variable."
describe('RF-122 — una única notificación de resumen por limpieza', () => {
  test('una sola notificación aunque la limpieza tenga varias operaciones, con los tres datos que pide el requisito', async () => {
    const { notificaciones, limpiar, sesionId } = await preparar();

    await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' },
      { columna: 'notas', estrategia: 'eliminar_columna' }
    ], true);

    expect(notificaciones.notificarLimpiezaCompletada).toHaveBeenCalledTimes(1);
    expect(notificaciones.notificarLimpiezaCompletada).toHaveBeenCalledWith('analista-A', {
      nombreArchivo: 'encuesta.csv',
      version: 1,
      filasAntes: 10,
      filasEliminadas: 1,
      columnasEliminadas: ['notas'],
      celdasImputadas: 2,
      metodosPorVariable: [
        { variable: 'notas', metodo: 'eliminación de la columna' },
        { variable: 'ciudad', metodo: 'eliminación de filas con el valor faltante' },
        { variable: 'edad', metodo: 'media' }
      ]
    });
  });

  test('devuelve el mismo resultado que el caso de uso que decora', async () => {
    const { limpiar, sesionId } = await preparar();

    const resultado = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);

    expect(resultado).toMatchObject({ version: 1, versionBase: 0, resumen: { celdasImputadas: 2 } });
    expect(resultado.sesionId).toEqual(expect.any(String));
  });
});

describe('RF-138 — corrección de tipo y variable objetivo', () => {
  test('corregir un tipo se audita con el antes y el después', async () => {
    const { repositorio, store, auditoria, sesionId, datasetId } = await preparar();
    const corregir = new CorregirTipoDeVariableConAuditoria(new CorregirTipoDeVariable(store, repositorio), auditoria);

    await corregir.ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuario: 'analista-A',
      accion: 'CorregirTipoDeVariable',
      detalle: '"encuesta.csv" (original): "edad" pasa de numérica discreta a categórica nominal',
      datasetId
    });
  });

  test('una corrección que no cambia nada no se audita', async () => {
    const { repositorio, store, auditoria, sesionId } = await preparar();
    const corregir = new CorregirTipoDeVariableConAuditoria(new CorregirTipoDeVariable(store, repositorio), auditoria);

    const resultado = await corregir.ejecutar('analista-A', sesionId, 'edad', 'numerica_discreta');

    expect(resultado.huboCambio).toBe(false);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  test('confirmar y descartar la variable objetivo se auditan; repetir la misma decisión, no', async () => {
    const { repositorio, store, auditoria, sesionId, datasetId } = await preparar();
    const definir = new DefinirVariableObjetivoConAuditoria(new DefinirVariableObjetivo(store, repositorio), auditoria);

    await definir.ejecutar('analista-A', sesionId, 'ciudad');
    await definir.ejecutar('analista-A', sesionId, 'ciudad');
    await definir.ejecutar('analista-A', sesionId, null);

    expect(auditoria.registrar.mock.calls.map(([registro]) => registro)).toEqual([
      {
        usuario: 'analista-A',
        accion: 'DefinirVariableObjetivo',
        detalle: '"encuesta.csv" (original): variable objetivo confirmada: "ciudad"',
        datasetId
      },
      {
        usuario: 'analista-A',
        accion: 'DefinirVariableObjetivo',
        detalle: '"encuesta.csv" (original): el analista descartó tener variable objetivo',
        datasetId
      }
    ]);
  });
});

describe('RF-138 — exportación', () => {
  test('exportar el original y exportar una versión se auditan diciendo cuál fue', async () => {
    const { repositorio, auditoria, limpiar, sesionId, datasetId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'eliminar_registros' }], true);
    auditoria.registrar.mockClear();
    const exportar = new ExportarDatasetGenericoConAuditoria(new ExportarDatasetGenerico(repositorio), auditoria);

    const original = await exportar.ejecutar(datasetId, 'analista-A');
    await exportar.ejecutar(v1.datasetId, 'analista-A');

    expect(Buffer.isBuffer(original.contenido)).toBe(true);
    expect(auditoria.registrar.mock.calls.map(([registro]) => registro)).toEqual([
      { usuario: 'analista-A', accion: 'ExportarDatasetGenerico', detalle: '"encuesta.csv" (original) exportado a Excel (10 fila(s))', datasetId },
      { usuario: 'analista-A', accion: 'ExportarDatasetGenerico', detalle: '"encuesta.csv" (versión 1) exportado a Excel (8 fila(s))', datasetId }
    ]);
  });

  test('una exportación que falla (dataset ajeno) no se audita', async () => {
    const { repositorio, auditoria, datasetId } = await preparar();
    const exportar = new ExportarDatasetGenericoConAuditoria(new ExportarDatasetGenerico(repositorio), auditoria);

    await expect(exportar.ejecutar(datasetId, 'analista-B')).rejects.toThrow(DatasetGenericoNoEncontradoError);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
