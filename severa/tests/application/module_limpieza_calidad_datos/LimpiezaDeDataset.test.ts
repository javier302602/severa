import { ProponerTratamientoDeFaltantes } from '../../../src/application/usecases/module_limpieza_calidad_datos/ProponerTratamientoDeFaltantes';
import { AplicarLimpiezaDeDataset } from '../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { ConsultarBitacoraDeDataset } from '../../../src/application/usecases/module_limpieza_calidad_datos/ConsultarBitacoraDeDataset';
import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { DefinirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { DecisionDeTratamiento } from '../../../src/domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { TratamientoDeFaltantesInvalidoError } from '../../../src/domain/errors/TratamientoDeFaltantesInvalidoError';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { SesionSinDatasetError } from '../../../src/domain/errors/SesionSinDatasetError';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';

// M-15, Ronda 2 (RF-120, RF-121, RF-123) y lo que M-12 dejó para cuando
// existieran datasets procesados (RF-136, RF-137).
const COLUMNAS = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, null, ''],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, 'Lima', 'Cusco'],
  puntaje: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5]
};

const IMPUTAR_EDAD: DecisionDeTratamiento[] = [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }];

async function preparar() {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
  return {
    repositorio,
    store,
    ...cargado,
    proponer: new ProponerTratamientoDeFaltantes(store),
    limpiar: new AplicarLimpiezaDeDataset(store, repositorio),
    bitacora: new ConsultarBitacoraDeDataset(repositorio)
  };
}

describe('RF-120 — la propuesta', () => {
  test('una propuesta por variable con faltantes, con el tamaño del dataset para dimensionarla', async () => {
    const { proponer, sesionId } = await preparar();

    const propuesta = await proponer.ejecutar('analista-A', sesionId);

    expect(propuesta).toMatchObject({ totalFilas: 10, totalColumnas: 3 });
    expect(propuesta.propuestas.map((p) => [p.columna, p.valoresFaltantes, p.recomendacion.estrategia])).toEqual([
      ['edad', 2, 'imputar'],
      ['ciudad', 1, 'imputar']
    ]);
  });

  test('proponer no modifica nada: ni datos, ni versiones, ni bitácora', async () => {
    const { repositorio, store, proponer, sesionId, datasetId, filas } = await preparar();
    const antes = JSON.stringify(filas);

    await proponer.ejecutar('analista-A', sesionId);

    expect(JSON.stringify(store.obtener('analista-A', sesionId)?.filas)).toBe(antes);
    expect(await repositorio.listarVersiones(datasetId, 'analista-A')).toHaveLength(1);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('la sesión de otro analista no se puede consultar', async () => {
    const { proponer, sesionId } = await preparar();

    await expect(proponer.ejecutar('analista-B', sesionId)).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});

describe('RF-120 — vista previa', () => {
  test('dice qué pasaría con esas decisiones y no guarda nada', async () => {
    const { repositorio, limpiar, sesionId, datasetId } = await preparar();

    const resumen = await limpiar.previsualizar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ]);

    expect(resumen).toMatchObject({ filasAntes: 10, filasDespues: 9, filasEliminadas: 1, columnasEliminadas: [], celdasImputadas: 2 });
    expect(resumen.operaciones.map((operacion) => operacion.operacion)).toEqual(['eliminar_registros', 'imputar']);
    // El resumen no trae las filas resultantes: es un resumen.
    expect(resumen).not.toHaveProperty('filas');

    expect(await repositorio.listarVersiones(datasetId, 'analista-A')).toHaveLength(1);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('una decisión inválida se rechaza igual que al aplicar', async () => {
    const { limpiar, sesionId } = await preparar();

    await expect(limpiar.previsualizar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'moda' }])).rejects.toThrow(
      TratamientoDeFaltantesInvalidoError
    );
  });
});

describe('RF-120 — "el sistema nunca aplica una estrategia sin confirmación explícita del analista"', () => {
  test.each([
    ['false', false],
    ['el texto "true"', 'true'],
    ['1', 1],
    ['undefined', undefined],
    ['null', null]
  ])('con confirmado = %s no aplica nada', async (_caso, confirmado) => {
    const { repositorio, limpiar, sesionId, datasetId } = await preparar();

    await expect(limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, confirmado as never)).rejects.toThrow(
      'La limpieza no se aplica sin confirmación explícita.'
    );

    expect(await repositorio.listarVersiones(datasetId, 'analista-A')).toHaveLength(1);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('si alguna decisión es inválida no se genera ninguna versión', async () => {
    const { repositorio, limpiar, sesionId, datasetId } = await preparar();

    await expect(
      limpiar.ejecutar('analista-A', sesionId, [...IMPUTAR_EDAD, { columna: 'puntaje', estrategia: 'eliminar_columna' }], true)
    ).rejects.toThrow('La columna "puntaje" no tiene valores faltantes que tratar.');

    expect(await repositorio.listarVersiones(datasetId, 'analista-A')).toHaveLength(1);
  });
});

describe('RF-136/137 — aplicar genera una versión nueva y no toca la anterior', () => {
  test('crea la versión 1, con sus propios registros, y devuelve una sesión nueva sobre ella', async () => {
    const { repositorio, store, limpiar, sesionId, datasetId } = await preparar();

    const resultado = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);

    expect(resultado).toMatchObject({
      datasetOriginalId: datasetId,
      nombreArchivo: 'encuesta.csv',
      version: 1,
      versionBase: 0,
      resumen: { filasAntes: 10, filasDespues: 10, filasEliminadas: 0, celdasImputadas: 2 }
    });
    expect(resultado.datasetId).not.toBe(datasetId);
    expect(resultado.sesionId).not.toBe(sesionId);

    // La versión guardada tiene las filas limpias, en el mismo orden.
    const registros = await repositorio.listarRegistros(resultado.datasetId, 'analista-A');
    expect(registros.map((registro) => registro.valores.edad)).toEqual([20, 25, 30, 35, 40, 22, 38, 30, 30, 30]);
    expect(registros.map((registro) => registro.posicion)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // La sesión nueva trabaja sobre la versión nueva.
    expect(store.obtener('analista-A', resultado.sesionId)).toMatchObject({ datasetId: resultado.datasetId });
    expect(resultado.diagnostico.columnas[0]).toMatchObject({ nombre: 'edad', valoresFaltantes: 0 });
    expect(resultado.perfilVariables[0]).toMatchObject({ nombre: 'edad', valoresValidos: 10, media: 30 });
  });

  test('el dataset original queda idéntico: mismos registros, misma sesión, mismo hash', async () => {
    const { repositorio, store, limpiar, sesionId, datasetId, filas } = await preparar();
    const registrosAntes = JSON.stringify(await repositorio.listarRegistros(datasetId, 'analista-A'));
    const filasAntes = JSON.stringify(filas);
    const originalAntes = await repositorio.buscarPorId(datasetId, 'analista-A');

    await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ], true);

    expect(JSON.stringify(await repositorio.listarRegistros(datasetId, 'analista-A'))).toBe(registrosAntes);
    expect(JSON.stringify(store.obtener('analista-A', sesionId)?.filas)).toBe(filasAntes);
    expect(await repositorio.buscarPorId(datasetId, 'analista-A')).toBe(originalAntes);
    expect(originalAntes?.hashOriginalSha256).toBe('hash-del-archivo');
  });

  test('una versión procesada no tiene hash de archivo: el hash es del archivo original (RF-135)', async () => {
    const { repositorio, limpiar, sesionId } = await preparar();

    const resultado = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);

    const version = await repositorio.buscarPorId(resultado.datasetId, 'analista-A');
    expect(version).toMatchObject({ esOriginal: false, fuente: 'limpieza', hashOriginalSha256: null, totalFilas: 10 });
  });

  test('las versiones se numeran en secuencia, y cada una recuerda de cuál partió', async () => {
    const { repositorio, limpiar, sesionId, datasetId } = await preparar();

    // v1: desde el original. v2: desde v1. v3: otra vez desde el original.
    const v1 = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);
    const v2 = await limpiar.ejecutar('analista-A', v1.sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);
    const v3 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'eliminar_registros' }], true);

    expect([v1, v2, v3].map((v) => [v.version, v.versionBase])).toEqual([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    expect([v1, v2, v3].every((v) => v.datasetOriginalId === datasetId)).toBe(true);
    expect((await repositorio.listarVersiones(datasetId, 'analista-A')).map((v) => v.version)).toEqual([0, 1, 2, 3]);
    // v2 hereda la imputación de v1; v3 no (partió del original).
    expect(v2.diagnostico.columnas.map((c) => c.valoresFaltantes)).toEqual([0, 0, 0]);
    expect(v3.diagnostico.totalFilas).toBe(8);
  });

  test('limpiar una versión que ya no tiene faltantes en esa variable se rechaza: no hay nada que tratar', async () => {
    const { limpiar, sesionId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);

    await expect(limpiar.ejecutar('analista-A', v1.sesionId, IMPUTAR_EDAD, true)).rejects.toThrow(
      'La columna "edad" no tiene valores faltantes que tratar.'
    );
  });

  test('la sesión de otro analista no se puede limpiar', async () => {
    const { limpiar, sesionId } = await preparar();

    await expect(limpiar.ejecutar('analista-B', sesionId, IMPUTAR_EDAD, true)).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });

  test('una sesión sin dataset guardado no se puede limpiar (no habría de qué versionar)', async () => {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a'], filas: [{ a: 1 }, { a: null }] });

    await expect(
      new AplicarLimpiezaDeDataset(store, repositorio).ejecutar('analista-A', sesionId, [{ columna: 'a', estrategia: 'eliminar_registros' }], true)
    ).rejects.toThrow(SesionSinDatasetError);
  });
});

describe('qué hereda la versión nueva', () => {
  test('RF-111: las correcciones de tipo de las columnas que siguen existiendo', async () => {
    const { repositorio, store, limpiar, sesionId } = await preparar();
    const corregir = new CorregirTipoDeVariable(store, repositorio);
    await corregir.ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');
    await corregir.ejecutar('analista-A', sesionId, 'ciudad', 'texto_libre');

    const resultado = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'ciudad', estrategia: 'eliminar_columna' }], true);

    expect(resultado.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
    expect(store.obtener('analista-A', resultado.sesionId)?.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
    expect((await repositorio.buscarPorId(resultado.datasetId, 'analista-A'))?.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
  });

  test('RF-111 + RF-121: una numérica marcada como categórica se imputa por moda', async () => {
    const { repositorio, store, limpiar, sesionId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');

    await expect(limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true)).rejects.toThrow('el método debe ser moda');
    const resultado = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'moda' }], true);

    // 30 aparece dos veces; el resto, una.
    expect(resultado.resumen.operaciones[0]).toMatchObject({ metodo: 'moda', valorImputado: 30 });
  });

  test('RF-110: la variable objetivo confirmada, si la columna sigue existiendo', async () => {
    const { repositorio, store, limpiar, sesionId } = await preparar();
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, 'puntaje');

    const resultado = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);

    expect(resultado.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'puntaje' });
  });

  test('RF-110: si la limpieza elimina la variable objetivo, la decisión vuelve a "pendiente"', async () => {
    const { repositorio, store, limpiar, sesionId, datasetId } = await preparar();
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, 'edad');

    const resultado = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'eliminar_columna' }], true);

    expect(resultado.variableObjetivo).toEqual({ estado: 'pendiente', columna: null });
    // En el original sigue confirmada: es otra versión.
    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'edad' });
  });
});

// RF-123: "cada entrada incluye fecha, usuario, operación, variable afectada,
// cantidad de registros afectados y método aplicado. El analista puede
// consultar la bitácora de cualquier dataset."
describe('RF-123 — bitácora', () => {
  test('una entrada por operación, con todos los campos que pide el requisito', async () => {
    const { limpiar, bitacora, sesionId, datasetId } = await preparar();
    const antes = Date.now();

    await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ], true);

    const entradas = await bitacora.ejecutar('analista-A', datasetId);
    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toMatchObject({
      analistaId: 'analista-A',
      operacion: 'eliminar_registros',
      variable: 'ciudad',
      registrosAfectados: 1,
      metodo: 'eliminación de filas con el valor faltante',
      versionOrigen: 0,
      versionResultado: 1,
      secuencia: 0
    });
    expect(entradas[1]).toMatchObject({
      operacion: 'imputar',
      variable: 'edad',
      registrosAfectados: 2,
      metodo: 'media',
      versionOrigen: 0,
      versionResultado: 1,
      secuencia: 1,
      detalle: { valorImputado: 30 }
    });
    entradas.forEach((entrada) => {
      expect(entrada.fecha.getTime()).toBeGreaterThanOrEqual(antes);
    });
    // Todas las operaciones de una misma limpieza comparten fecha.
    expect(entradas[0].fecha.getTime()).toBe(entradas[1].fecha.getTime());
  });

  test('la nota de una operación (por ejemplo, moda con empate) queda en el detalle', async () => {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const { sesionId, datasetId } = await cargarDatasetDePrueba(repositorio, store, {
      columnas: { ciudad: ['Lima', 'Cusco', 'Lima', 'Cusco', 'Arequipa', 'Lima', 'Cusco', null] }
    });

    await new AplicarLimpiezaDeDataset(store, repositorio).ejecutar('analista-A', sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);

    const [entrada] = await repositorio.listarBitacora(datasetId, 'analista-A');
    expect(entrada.detalle).toEqual({ valorImputado: 'Cusco', nota: expect.stringMatching(/categorías empatadas/) });
  });

  test('la bitácora es de toda la familia: se puede pedir con el id del original o con el de cualquier versión', async () => {
    const { repositorio, store, limpiar, bitacora, sesionId, datasetId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'puntaje', 'categorica_nominal');
    const v1 = await limpiar.ejecutar('analista-A', sesionId, IMPUTAR_EDAD, true);
    await limpiar.ejecutar('analista-A', v1.sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);

    const porOriginal = await bitacora.ejecutar('analista-A', datasetId);
    const porVersion = await bitacora.ejecutar('analista-A', v1.datasetId);

    expect(porVersion).toEqual(porOriginal);
    expect(porOriginal.map((entrada) => [entrada.operacion, entrada.versionOrigen, entrada.versionResultado])).toEqual([
      ['corregir_tipo', 0, null],
      ['imputar', 0, 1],
      ['imputar', 1, 2]
    ]);
  });

  test('un dataset sin operaciones tiene la bitácora vacía', async () => {
    const { bitacora, datasetId } = await preparar();

    expect(await bitacora.ejecutar('analista-A', datasetId)).toEqual([]);
  });

  test('la bitácora de un dataset ajeno responde igual que la de uno que no existe', async () => {
    const { bitacora, datasetId } = await preparar();

    await expect(bitacora.ejecutar('analista-B', datasetId)).rejects.toThrow(DatasetGenericoNoEncontradoError);
    await expect(bitacora.ejecutar('analista-A', 'no-existe')).rejects.toThrow(DatasetGenericoNoEncontradoError);
  });
});
