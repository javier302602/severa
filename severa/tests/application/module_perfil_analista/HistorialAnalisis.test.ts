import ExcelJS from 'exceljs';
import { ObtenerHistorialAnalisis } from '../../../src/application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';
import { RegistrarEnHistorialDeAnalisis } from '../../../src/application/usecases/module_perfil_analista/RegistrarEnHistorialDeAnalisis';
import { ExportarHistorialAnalisis } from '../../../src/application/usecases/module_perfil_analista/ExportarHistorialAnalisis';
import { conHistorialDeSesion, conHistorialDelCatalogo } from '../../../src/application/usecases/module_perfil_analista/decoradores/ConHistorialDeAnalisis';
import { ExportadorDeTablaExcelJs } from '../../../src/infrastructure/adapters/out/exportacion/ExportadorDeTablaExcelJs';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { AplicarLimpiezaDeDataset } from '../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { AnalisisRealizado } from '../../../src/domain/entities/AnalisisRealizado';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';
import { HistorialAnalisisRepositoryEnMemoria, historialFalso } from '../../dobles/HistorialAnalisisRepositoryEnMemoria';

const COLUMNAS = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, null, 28],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', 'Lima', 'Lima', 'Cusco']
};

async function preparar(ahora: () => Date = () => new Date()) {
  const historial = new HistorialAnalisisRepositoryEnMemoria();
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { nombreArchivo: 'encuesta.csv', columnas: COLUMNAS });
  return {
    historial,
    repositorio,
    store,
    ...cargado,
    registrar: new RegistrarEnHistorialDeAnalisis(historial, store, repositorio, ahora),
    obtener: new ObtenerHistorialAnalisis(historial)
  };
}

describe('RF-11 — qué queda en el historial', () => {
  test('un análisis sobre un dataset queda con fecha, dataset, versión y tipo de análisis', async () => {
    const fecha = new Date('2026-10-08T15:00:00Z');
    const { registrar, obtener, sesionId, datasetId } = await preparar(() => fecha);

    await registrar.deSesion('analista-A', sesionId, 'MatrizDeCorrelacion');

    const pagina = await obtener.ejecutar('analista-A');
    expect(pagina.total).toBe(1);
    expect(pagina.eventos[0]).toMatchObject({
      fechaHora: fecha,
      tipoDeAnalisis: 'Matriz de correlación',
      origen: 'dataset',
      dataset: 'encuesta.csv',
      datasetId,
      version: 0
    });
  });

  test('pedir veinte veces el mismo análisis en una sesión lo anota una sola vez', async () => {
    const { registrar, historial, sesionId } = await preparar();

    for (let i = 0; i < 20; i += 1) await registrar.deSesion('analista-A', sesionId, 'AnalisisUnivariado');

    expect(historial.eventos).toHaveLength(1);
  });

  test('tampoco se duplica si el proceso se reinició entre medio (otra instancia, misma base)', async () => {
    const { registrar, historial, store, repositorio, sesionId } = await preparar();
    await registrar.deSesion('analista-A', sesionId, 'AnalisisUnivariado');

    const trasReinicio = new RegistrarEnHistorialDeAnalisis(historial, store, repositorio);
    await trasReinicio.deSesion('analista-A', sesionId, 'AnalisisUnivariado');

    expect(historial.eventos).toHaveLength(1);
  });

  test('dos pedidos simultáneos del mismo análisis tampoco lo duplican', async () => {
    const { registrar, historial, sesionId } = await preparar();

    await Promise.all(Array.from({ length: 8 }, () => registrar.deSesion('analista-A', sesionId, 'ValoresAtipicos')));

    expect(historial.eventos).toHaveLength(1);
  });

  test('tipos distintos, o el mismo tipo en otra sesión, sí son análisis distintos', async () => {
    const { registrar, historial, store, sesionId, datasetId } = await preparar();
    const filas = store.obtener('analista-A', sesionId)!;
    const otraSesion = store.crear('analista-A', { ...filas, datasetId });

    await registrar.deSesion('analista-A', sesionId, 'AnalisisUnivariado');
    await registrar.deSesion('analista-A', sesionId, 'MatrizDeCorrelacion');
    await registrar.deSesion('analista-A', otraSesion, 'AnalisisUnivariado');

    expect(historial.eventos.map((evento) => evento.tipoEvento).sort()).toEqual(['AnalisisUnivariado', 'AnalisisUnivariado', 'MatrizDeCorrelacion']);
  });

  test('lo que se anota "cada vez" (un informe, una limpieza) queda todas las veces, con su detalle', async () => {
    const { registrar, obtener, sesionId } = await preparar();

    await registrar.deSesion('analista-A', sesionId, 'InformeDeDataset', { cadaVez: true, detalle: 'Formato PDF' });
    await registrar.deSesion('analista-A', sesionId, 'InformeDeDataset', { cadaVez: true, detalle: 'Formato DOCX' });

    const pagina = await obtener.ejecutar('analista-A');
    expect(pagina.eventos.map((evento) => evento.detalle).sort()).toEqual(['Formato DOCX', 'Formato PDF']);
  });

  test('un análisis sobre una versión procesada dice de qué versión fue', async () => {
    const { registrar, obtener, store, repositorio, sesionId } = await preparar();
    const limpieza = await new AplicarLimpiezaDeDataset(store, repositorio).ejecutar(
      'analista-A',
      sesionId,
      [{ columna: 'edad', estrategia: 'imputar', metodo: 'mediana' }],
      true
    );

    await registrar.deSesion('analista-A', limpieza.sesionId, 'EstadisticasDescriptivas');

    const [evento] = (await obtener.ejecutar('analista-A')).eventos;
    expect(evento).toMatchObject({ dataset: 'encuesta.csv', version: 1, datasetId: limpieza.datasetId });
  });

  test('los análisis del catálogo se anotan a lo sumo una vez por día y por tipo', async () => {
    let ahora = new Date('2026-10-08T10:00:00Z');
    const { registrar, obtener } = await preparar(() => ahora);

    await registrar.delCatalogo('analista-A', 'ResumenEstadistico');
    await registrar.delCatalogo('analista-A', 'ResumenEstadistico');
    await registrar.delCatalogo('analista-A', 'Graficos');
    ahora = new Date('2026-10-09T10:00:00Z');
    await registrar.delCatalogo('analista-A', 'ResumenEstadistico');

    const pagina = await obtener.ejecutar('analista-A');
    expect(pagina.eventos.map((evento) => `${evento.fechaHora.toISOString().slice(0, 10)} ${evento.tipoDeAnalisis}`).sort()).toEqual([
      '2026-10-08 Gráficos estadísticos',
      '2026-10-08 Resumen estadístico',
      '2026-10-09 Resumen estadístico'
    ]);
    expect(pagina.eventos[0].fechaHora.toISOString().slice(0, 10)).toBe('2026-10-09');
    expect(pagina.eventos.every((evento) => evento.dataset === 'Catálogo de vulnerabilidades' && evento.datasetId === null)).toBe(true);
  });

  test('el mismo análisis hecho por dos analistas queda en el historial de cada uno', async () => {
    const { registrar, obtener } = await preparar(() => new Date('2026-10-08T10:00:00Z'));

    await registrar.delCatalogo('analista-A', 'RankingDeUrgencia');
    await registrar.delCatalogo('analista-B', 'RankingDeUrgencia');

    expect((await obtener.ejecutar('analista-A')).total).toBe(1);
    expect((await obtener.ejecutar('analista-B')).total).toBe(1);
  });

  test('no se anota nada si la sesión no existe o es de otro analista', async () => {
    const { registrar, historial, sesionId } = await preparar();

    await registrar.deSesion('analista-A', 'sesion-que-no-existe', 'CalidadDeDatos');
    await registrar.deSesion('analista-intruso', sesionId, 'CalidadDeDatos');

    expect(historial.eventos).toHaveLength(0);
  });

  test('una sesión sin dataset guardado se anota igual, sin id para reabrir', async () => {
    const { registrar, obtener, store } = await preparar();
    const suelta = store.crear('analista-A', { columnas: ['x'], filas: [{ x: 1 }] });

    await registrar.deSesion('analista-A', suelta, 'EstadisticasDescriptivas');

    expect((await obtener.ejecutar('analista-A')).eventos[0]).toMatchObject({ dataset: 'Dataset sin guardar', datasetId: null, version: null });
  });

  test('si el historial falla, no lanza: el análisis que el analista pidió no depende de esto', async () => {
    const { store, repositorio, sesionId } = await preparar();
    const roto = new HistorialAnalisisRepositoryEnMemoria();
    roto.registrarSiEsNuevo = jest.fn().mockRejectedValue(new Error('base caída'));
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const registrar = new RegistrarEnHistorialDeAnalisis(roto, store, repositorio);

    await expect(registrar.deSesion('analista-A', sesionId, 'CalidadDeDatos')).resolves.toBeUndefined();
    await expect(registrar.delCatalogo('analista-A', 'Graficos')).resolves.toBeUndefined();

    expect(errores).toHaveBeenCalledTimes(2);
    // Y como no quedó guardado, el intento siguiente vuelve a probar.
    await registrar.deSesion('analista-A', sesionId, 'CalidadDeDatos');
    expect(roto.registrarSiEsNuevo).toHaveBeenCalledTimes(3);
    errores.mockRestore();
  });
});

describe('RF-11 — consulta del historial', () => {
  function sembrar(historial: HistorialAnalisisRepositoryEnMemoria, analistaId: string, cantidad: number) {
    for (let i = 0; i < cantidad; i += 1) {
      historial.eventos.push(
        new AnalisisRealizado(`${analistaId}-${String(i).padStart(4, '0')}`, analistaId, 'Graficos', {}, new Date(Date.UTC(2026, 0, 1) + i * 60_000))
      );
    }
  }

  test('un analista sin eventos obtiene un historial vacío', async () => {
    const pagina = await new ObtenerHistorialAnalisis(new HistorialAnalisisRepositoryEnMemoria()).ejecutar('analista-nuevo');

    expect(pagina).toEqual({ eventos: [], total: 0, limite: 50, desplazamiento: 0 });
  });

  test('devuelve una página, del más reciente al más antiguo, con el total de todo el historial', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    sembrar(historial, 'analista-A', 120);
    const obtener = new ObtenerHistorialAnalisis(historial);

    const primera = await obtener.ejecutar('analista-A');
    const tercera = await obtener.ejecutar('analista-A', { limite: 50, desplazamiento: 100 });

    expect(primera.total).toBe(120);
    expect(primera.eventos).toHaveLength(50);
    expect(primera.eventos[0].id).toBe('analista-A-0119');
    expect(primera.eventos[49].id).toBe('analista-A-0070');
    expect(tercera.eventos).toHaveLength(20);
    expect(tercera.eventos[19].id).toBe('analista-A-0000');
  });

  test('el límite se acota: nadie puede pedir el historial entero de una vez', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    sembrar(historial, 'analista-A', 300);
    const obtener = new ObtenerHistorialAnalisis(historial);

    expect((await obtener.ejecutar('analista-A', { limite: 100_000 })).eventos).toHaveLength(200);
    expect((await obtener.ejecutar('analista-A', { limite: 0 })).limite).toBe(1);
    expect((await obtener.ejecutar('analista-A', { limite: Number.NaN, desplazamiento: -5 }))).toMatchObject({ limite: 50, desplazamiento: 0 });
  });

  test('un analista no ve el historial de otro', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    sembrar(historial, 'analista-A', 3);
    sembrar(historial, 'analista-B', 2);
    const obtener = new ObtenerHistorialAnalisis(historial);

    const deA = await obtener.ejecutar('analista-A');
    const deB = await obtener.ejecutar('analista-B');

    expect(deA.total).toBe(3);
    expect(deA.eventos.every((evento) => evento.id.startsWith('analista-A-'))).toBe(true);
    expect(deB.total).toBe(2);
  });
});

describe('RF-11 — decoradores que anotan un caso de uso', () => {
  test('conHistorialDeSesion anota después de un análisis que salió bien y devuelve su resultado intacto', async () => {
    const historial = historialFalso();
    const usecase = { ejecutar: jest.fn(async (analistaId: string, sesionId: string, columna: string) => ({ analistaId, sesionId, columna })) };
    const decorado = conHistorialDeSesion(usecase, historial, 'AnalisisUnivariado');

    const resultado = await decorado.ejecutar('analista-A', 's1', 'edad');

    expect(resultado).toEqual({ analistaId: 'analista-A', sesionId: 's1', columna: 'edad' });
    expect(usecase.ejecutar).toHaveBeenCalledWith('analista-A', 's1', 'edad');
    expect(historial.deSesion).toHaveBeenCalledWith('analista-A', 's1', 'AnalisisUnivariado', undefined);
  });

  test('si el análisis falla, el error pasa tal cual y no se anota nada', async () => {
    const historial = historialFalso();
    const fallo = new Error('columna no numérica');
    const decorado = conHistorialDeSesion({ ejecutar: jest.fn().mockRejectedValue(fallo) }, historial, 'AnalisisUnivariado');

    await expect(decorado.ejecutar('analista-A', 's1')).rejects.toBe(fallo);
    expect(historial.deSesion).not.toHaveBeenCalled();
  });

  test('conHistorialDelCatalogo saca el analista de donde el caso de uso lo recibe y admite opciones según el resultado', async () => {
    const historial = historialFalso();
    const usecase = { ejecutar: jest.fn(async (tipo: string, analistaId: string) => `${tipo}/${analistaId}`) };
    const decorado = conHistorialDelCatalogo(
      usecase,
      historial,
      'Graficos',
      ([, analistaId]) => analistaId,
      (resultado, [tipo]) => ({ detalle: `${tipo} → ${resultado}` })
    );

    await decorado.ejecutar('histogramaCvss', 'analista-A');

    expect(historial.delCatalogo).toHaveBeenCalledWith('analista-A', 'Graficos', { detalle: 'histogramaCvss → histogramaCvss/analista-A' });
  });

  test('si el análisis del catálogo falla, tampoco se anota', async () => {
    const historial = historialFalso();
    const decorado = conHistorialDelCatalogo({ ejecutar: jest.fn().mockRejectedValue(new Error('catálogo vacío')) }, historial, 'Graficos', () => 'a');

    await expect(decorado.ejecutar()).rejects.toThrow('catálogo vacío');
    expect(historial.delCatalogo).not.toHaveBeenCalled();
  });
});

describe('RF-14 — exportación del historial a .xlsx', () => {
  async function leerHoja(buffer: Buffer) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const hoja = libro.worksheets[0];
    const filas: unknown[][] = [];
    hoja.eachRow((fila) => filas.push((fila.values as unknown[]).slice(1)));
    return { libro, hoja, filas };
  }

  test('el archivo es un .xlsx con fecha, dataset y tipo de análisis de cada evento, del más reciente al más antiguo', async () => {
    const reloj = { ahora: new Date('2026-10-07T09:00:00Z') };
    const { registrar, historial, sesionId } = await preparar(() => reloj.ahora);
    await registrar.deSesion('analista-A', sesionId, 'EstadisticasDescriptivas');
    reloj.ahora = new Date('2026-10-08T16:45:00Z');
    await registrar.deSesion('analista-A', sesionId, 'InformeDeDataset', { cadaVez: true, detalle: 'Formato PDF' });
    reloj.ahora = new Date('2026-10-08T18:00:00Z');
    await registrar.delCatalogo('analista-A', 'RankingDeUrgencia');
    await registrar.delCatalogo('analista-B', 'RankingDeUrgencia');

    const buffer = await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs()).ejecutar('analista-A');

    // Un .xlsx es un zip: empieza con la firma "PK".
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    const { hoja, filas } = await leerHoja(buffer);
    expect(hoja.name).toBe('Historial de análisis');
    // Lima es UTC-5 todo el año: las 18:00 UTC son las 13:00 de allá. La
    // celda guarda ese reloj (ExcelJS lo lee de vuelta como si fuera UTC).
    expect(filas[0]).toEqual(['Fecha (America/Lima)', 'Dataset', 'Versión', 'Tipo de análisis', 'Detalle']);
    expect(filas.slice(1)).toEqual([
      [new Date('2026-10-08T13:00:00Z'), 'Catálogo de vulnerabilidades', undefined, 'Ranking de urgencia'],
      [new Date('2026-10-08T11:45:00Z'), 'encuesta.csv', 'original', 'Informe completo', 'Formato PDF'],
      [new Date('2026-10-07T04:00:00Z'), 'encuesta.csv', 'original', 'Estadísticas descriptivas']
    ]);
  });

  test('la hora sale con el reloj de la zona configurada, y el encabezado dice cuál es', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    // 02:30 UTC del día 9 es todavía el día 8 en Lima (21:30) y ya las 11:30 del 9 en Tokio.
    historial.eventos.push(new AnalisisRealizado('e1', 'analista-A', 'Graficos', {}, new Date('2026-10-09T02:30:15Z')));

    const enLima = await leerHoja(await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs(), 'America/Lima').ejecutar('analista-A'));
    const enTokio = await leerHoja(await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs(), 'Asia/Tokyo').ejecutar('analista-A'));

    expect(enLima.filas[0][0]).toBe('Fecha (America/Lima)');
    expect(enLima.filas[1][0]).toEqual(new Date('2026-10-08T21:30:15Z'));
    expect(enTokio.filas[0][0]).toBe('Fecha (Asia/Tokyo)');
    expect(enTokio.filas[1][0]).toEqual(new Date('2026-10-09T11:30:15Z'));
  });

  test('una zona horaria mal escrita en la configuración no impide exportar: sale en UTC y lo dice', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    historial.eventos.push(new AnalisisRealizado('e1', 'analista-A', 'Graficos', {}, new Date('2026-10-09T02:30:15Z')));

    const { filas } = await leerHoja(await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs(), 'Lima/Peru-mal').ejecutar('analista-A'));

    expect(filas[0][0]).toBe('Fecha (UTC)');
    expect(filas[1][0]).toEqual(new Date('2026-10-09T02:30:15Z'));
  });

  test('la fecha viaja como fecha de Excel (se puede ordenar y filtrar), no como texto', async () => {
    const { registrar, historial, sesionId } = await preparar(() => new Date('2026-10-07T09:00:00Z'));
    await registrar.deSesion('analista-A', sesionId, 'EstadisticasDescriptivas');

    const { hoja } = await leerHoja(await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs()).ejecutar('analista-A'));

    const celda = hoja.getRow(2).getCell(1);
    expect(celda.value).toBeInstanceOf(Date);
    expect(celda.numFmt).toBe('yyyy-mm-dd hh:mm');
  });

  test('un nombre de dataset que empieza con "=" se exporta como texto, no como fórmula', async () => {
    const historial = new HistorialAnalisisRepositoryEnMemoria();
    historial.eventos.push(new AnalisisRealizado('e1', 'analista-A', 'AnalisisUnivariado', { dataset: '=HYPERLINK("http://x","clic")' }, new Date()));

    const { hoja } = await leerHoja(await new ExportarHistorialAnalisis(historial, new ExportadorDeTablaExcelJs()).ejecutar('analista-A'));

    const celda = hoja.getRow(2).getCell(2);
    expect(celda.type).toBe(ExcelJS.ValueType.String);
    expect(celda.value).toBe('=HYPERLINK("http://x","clic")');
  });

  test('un historial vacío exporta un archivo válido, solo con los encabezados', async () => {
    const buffer = await new ExportarHistorialAnalisis(new HistorialAnalisisRepositoryEnMemoria(), new ExportadorDeTablaExcelJs()).ejecutar('analista-A');

    const { filas } = await leerHoja(buffer);
    expect(filas).toEqual([['Fecha (America/Lima)', 'Dataset', 'Versión', 'Tipo de análisis', 'Detalle']]);
  });
});
