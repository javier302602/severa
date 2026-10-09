import { GenerarInformeDataset } from '../../../src/application/usecases/module_reportes_exportacion/GenerarInformeDataset';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { GeneradorDeInformes, InformeSolicitado, FormatoDeInforme } from '../../../src/application/ports/out/reportes/GeneradorDeInformes';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { AplicarLimpiezaDeDataset } from '../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { DefinirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';

function analistaRepositoryFalso(): AnalistaRepository {
  const analista = new Analista('analista-A', 'Ana Torres', new Correo('ana@example.com'), 'hash', 'analista');
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analista),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

function geradorDeInformesFalso(): jest.Mocked<GeneradorDeInformes> {
  return {
    generarInformeEnFormato: jest.fn(async (_informe: InformeSolicitado, formato: FormatoDeInforme) => ({
      contenido: Buffer.from(`${formato}-falso`),
      tipoMime: `tipo/${formato}`,
      extension: formato
    })),
    generarResumenEjecutivo: jest.fn()
  };
}

describe('GenerarInformeDataset — Mejora 4 (Análisis de Datos General) Fase 5', () => {
  test('formato pdf: delega en el store, arma el DTO y pide el informe del pipeline genérico', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso(), new DatasetGenericoRepositoryEnMemoria());

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', 'pdf');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.contenido.toString()).toBe('pdf-falso');
    expect(gerador.generarInformeEnFormato).toHaveBeenCalledTimes(1);

    const [informe, formato, opciones] = gerador.generarInformeEnFormato.mock.calls[0];
    expect(formato).toBe('pdf');
    expect(opciones).toEqual({});
    expect(informe.pipeline).toBe('generico');
    if (informe.pipeline === 'generico') expect(informe.datos.totalFilas).toBe(2);
  });

  test.each(['docx', 'html', 'latex', 'xlsx'] as const)('formato %s: pasa el formato pedido tal cual al generador', async (formato) => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso(), new DatasetGenericoRepositoryEnMemoria());

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', formato, { adjuntarGraficos: true });

    expect(resultado.extension).toBe(formato);
    expect(gerador.generarInformeEnFormato).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'generico' }), formato, { adjuntarGraficos: true });
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError sin llamar al generador', async () => {
    const store = storeFalso(undefined);
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso(), new DatasetGenericoRepositoryEnMemoria());

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', 'pdf')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    expect(gerador.generarInformeEnFormato).not.toHaveBeenCalled();
  });
});

// Sección 8 del informe (RF-130) con datos de verdad: de qué versión del
// dataset salen los datos y qué limpieza la produjo (RF-123, RF-136).
describe('GenerarInformeDataset — procedencia de los datos', () => {
  const COLUMNAS = {
    edad: [20, 25, 30, 35, 40, 22, 38, 30, null, ''],
    ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, 'Lima', 'Cusco'],
    puntaje: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5]
  };

  async function preparar() {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
    const gerador = geradorDeInformesFalso();
    const informe = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso(), repositorio);
    const datosDelUltimoInforme = () => {
      const [solicitado] = gerador.generarInformeEnFormato.mock.calls[gerador.generarInformeEnFormato.mock.calls.length - 1];
      if (solicitado.pipeline !== 'generico') throw new Error('se esperaba el pipeline genérico');
      return solicitado.datos;
    };
    return { repositorio, store, ...cargado, informe, datosDelUltimoInforme, limpiar: new AplicarLimpiezaDeDataset(store, repositorio) };
  }

  test('informe del dataset original: versión 0, sin operaciones', async () => {
    const { informe, datosDelUltimoInforme, sesionId } = await preparar();

    await informe.ejecutar('analista-A', sesionId, 'pdf');

    expect(datosDelUltimoInforme().procedencia).toEqual({
      nombreArchivo: 'encuesta.csv',
      version: 0,
      versionBase: null,
      operaciones: [],
      variableObjetivo: null
    });
  });

  test('informe de una versión procesada: trae las operaciones que la generaron, con valor imputado y nota', async () => {
    const { informe, datosDelUltimoInforme, limpiar, sesionId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ], true);

    await informe.ejecutar('analista-A', v1.sesionId, 'docx');

    const { procedencia, totalFilas } = datosDelUltimoInforme();
    expect(totalFilas).toBe(9);
    expect(procedencia).toMatchObject({ nombreArchivo: 'encuesta.csv', version: 1, versionBase: 0 });
    expect(procedencia?.operaciones.map(({ fecha: _fecha, ...resto }) => resto)).toEqual([
      {
        versionOrigen: 0,
        versionResultado: 1,
        operacion: 'eliminar_registros',
        variable: 'ciudad',
        registrosAfectados: 1,
        metodo: 'eliminación de filas con el valor faltante'
      },
      { versionOrigen: 0, versionResultado: 1, operacion: 'imputar', variable: 'edad', registrosAfectados: 2, metodo: 'media', valorImputado: 30 }
    ]);
    procedencia?.operaciones.forEach((operacion) => expect(operacion.fecha).toBeInstanceOf(Date));
  });

  test('una versión generada desde otra versión acumula el camino completo, en orden', async () => {
    const { informe, datosDelUltimoInforme, limpiar, sesionId } = await preparar();
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'mediana' }], true);
    const v2 = await limpiar.ejecutar('analista-A', v1.sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);

    await informe.ejecutar('analista-A', v2.sesionId, 'pdf');

    const { procedencia } = datosDelUltimoInforme();
    expect(procedencia).toMatchObject({ version: 2, versionBase: 1 });
    expect(procedencia?.operaciones.map((operacion) => [operacion.versionOrigen, operacion.versionResultado, operacion.variable, operacion.metodo])).toEqual([
      [0, 1, 'edad', 'mediana'],
      [1, 2, 'ciudad', 'moda']
    ]);
  });

  test('las limpiezas de OTRAS ramas no aparecen: solo las del camino desde el original hasta esta versión', async () => {
    const { informe, datosDelUltimoInforme, limpiar, sesionId } = await preparar();
    // v1 y v2 salen las dos del original; v2 no pasó por v1.
    await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);
    const v2 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'ciudad', estrategia: 'eliminar_registros' }], true);

    await informe.ejecutar('analista-A', v2.sesionId, 'pdf');

    const { procedencia } = datosDelUltimoInforme();
    expect(procedencia).toMatchObject({ version: 2, versionBase: 0 });
    expect(procedencia?.operaciones.map((operacion) => operacion.variable)).toEqual(['ciudad']);
  });

  test('corregir un tipo o definir la variable objetivo no son operaciones de limpieza: no entran en la lista', async () => {
    const { repositorio, store, informe, datosDelUltimoInforme, limpiar, sesionId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'edad', 'categorica_nominal');
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, 'puntaje');
    const v1 = await limpiar.ejecutar('analista-A', sesionId, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }], true);

    await informe.ejecutar('analista-A', v1.sesionId, 'pdf');

    const datos = datosDelUltimoInforme();
    expect(datos.procedencia?.operaciones.map((operacion) => operacion.operacion)).toEqual(['imputar']);
    // ...pero las dos decisiones sí llegan al informe por su lado.
    expect(datos.procedencia?.variableObjetivo).toBe('puntaje');
    expect(datos.columnas.find((columna) => columna.nombre === 'edad')).toMatchObject({ tipo: 'categorica', tipoCorregidoManualmente: true });
  });

  test('una variable objetivo rechazada o pendiente no se informa', async () => {
    const { repositorio, store, informe, datosDelUltimoInforme, sesionId } = await preparar();
    await new DefinirVariableObjetivo(store, repositorio).ejecutar('analista-A', sesionId, null);

    await informe.ejecutar('analista-A', sesionId, 'pdf');

    expect(datosDelUltimoInforme().procedencia?.variableObjetivo).toBeNull();
  });

  test('una sesión sin dataset guardado, o cuyo dataset ya no existe, genera el informe igual, sin procedencia', async () => {
    const repositorio = new DatasetGenericoRepositoryEnMemoria();
    const store = new SesionAnalisisStoreEnMemoria();
    const gerador = geradorDeInformesFalso();
    const informe = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso(), repositorio);
    const sinDataset = store.crear('analista-A', { columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const datasetBorrado = store.crear('analista-A', { columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }], datasetId: 'ya-no-existe' });

    await informe.ejecutar('analista-A', sinDataset, 'pdf');
    await informe.ejecutar('analista-A', datasetBorrado, 'pdf');

    gerador.generarInformeEnFormato.mock.calls.forEach(([solicitado]) => {
      expect(solicitado.datos).not.toHaveProperty('procedencia');
    });
  });
});
