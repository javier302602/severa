import {
  claveDeAnalisisDeSesion,
  claveDeAnalisisDelDia,
  DATASET_DEL_CATALOGO,
  DATASET_SIN_GUARDAR,
  ETIQUETA_DE_TIPO_DE_ANALISIS,
  nombreDeVersionDeDataset,
  origenDeTipoDeAnalisis,
  presentarAnalisisRealizado,
  TIPOS_DE_ANALISIS_DE_DATASET,
  TIPOS_DE_ANALISIS_DEL_CATALOGO
} from '../../../../src/domain/services/historial/HistorialDeAnalisis';
import { AnalisisRealizado } from '../../../../src/domain/entities/AnalisisRealizado';

const FECHA = new Date('2026-10-08T15:30:00Z');

describe('HistorialDeAnalisis — RF-11 / RF-14', () => {
  test('todo tipo de análisis tiene una etiqueta legible y un único origen', () => {
    const todos = [...TIPOS_DE_ANALISIS_DE_DATASET, ...TIPOS_DE_ANALISIS_DEL_CATALOGO];

    expect(new Set(todos).size).toBe(todos.length);
    expect(Object.keys(ETIQUETA_DE_TIPO_DE_ANALISIS).sort()).toEqual([...todos].sort());
    for (const tipo of todos) expect(ETIQUETA_DE_TIPO_DE_ANALISIS[tipo].trim()).not.toBe('');

    expect(origenDeTipoDeAnalisis('EstadisticasDescriptivas')).toBe('dataset');
    expect(origenDeTipoDeAnalisis('RankingDeUrgencia')).toBe('catalogo');
  });

  test('presenta un análisis sobre un dataset guardado con su nombre, su versión y su id para poder reabrirlo', () => {
    const evento = new AnalisisRealizado('e1', 'a1', 'MatrizDeCorrelacion', { dataset: 'encuesta.csv', datasetId: 'd-7', version: 2 }, FECHA);

    expect(presentarAnalisisRealizado(evento)).toEqual({
      id: 'e1',
      fechaHora: FECHA,
      tipoEvento: 'MatrizDeCorrelacion',
      tipoDeAnalisis: 'Matriz de correlación',
      origen: 'dataset',
      dataset: 'encuesta.csv',
      datasetId: 'd-7',
      version: 2,
      detalle: null
    });
  });

  test('un análisis del catálogo dice sobre qué se hizo aunque no tenga un dataset que reabrir', () => {
    const evento = new AnalisisRealizado('e2', 'a1', 'RankingDeUrgencia', { dataset: DATASET_DEL_CATALOGO }, FECHA);
    const presentado = presentarAnalisisRealizado(evento);

    expect(presentado).toMatchObject({ origen: 'catalogo', dataset: 'Catálogo de vulnerabilidades', datasetId: null, version: null });
  });

  test('los eventos anteriores a esta ronda ("InformeGenerado" con solo el formato) se siguen pudiendo leer', () => {
    const viejo = new AnalisisRealizado('e3', 'a1', 'InformeGenerado', { formato: 'pdf' }, FECHA);

    expect(presentarAnalisisRealizado(viejo)).toMatchObject({
      tipoDeAnalisis: 'Informe completo',
      origen: 'catalogo',
      dataset: DATASET_DEL_CATALOGO,
      detalle: 'Formato PDF'
    });
  });

  test('un detalle explícito le gana al formato', () => {
    const evento = new AnalisisRealizado('e4', 'a1', 'InformeGenerado', { formato: 'pdf', detalle: 'Formato DOCX' }, FECHA);

    expect(presentarAnalisisRealizado(evento).detalle).toBe('Formato DOCX');
  });

  test('un tipo que el sistema no conoce se muestra tal cual, sin esconderlo', () => {
    const raro = new AnalisisRealizado('e5', 'a1', 'AnalisisDelFuturo', {}, FECHA);
    const conDataset = new AnalisisRealizado('e6', 'a1', 'AnalisisDelFuturo', { datasetId: 'd-1' }, FECHA);

    expect(presentarAnalisisRealizado(raro)).toMatchObject({ tipoDeAnalisis: 'AnalisisDelFuturo', origen: 'catalogo', dataset: DATASET_DEL_CATALOGO });
    expect(presentarAnalisisRealizado(conDataset)).toMatchObject({ origen: 'dataset', dataset: DATASET_SIN_GUARDAR, datasetId: 'd-1' });
  });

  test('un payload con datos de tipo inesperado no rompe la presentación', () => {
    const evento = new AnalisisRealizado('e7', 'a1', 'AnalisisUnivariado', { dataset: 42, datasetId: '', version: '2', detalle: {} }, FECHA);

    expect(presentarAnalisisRealizado(evento)).toMatchObject({ dataset: DATASET_SIN_GUARDAR, datasetId: null, version: null, detalle: null });
  });

  test('la versión 0 es el original', () => {
    expect(nombreDeVersionDeDataset(0)).toBe('original');
    expect(nombreDeVersionDeDataset(3)).toBe('versión 3');
  });

  test('la clave de una sesión distingue sesión y tipo; la del día, día (UTC) y tipo', () => {
    expect(claveDeAnalisisDeSesion('s1', 'ValoresAtipicos')).toBe('sesion:s1:ValoresAtipicos');
    expect(claveDeAnalisisDeSesion('s1', 'ValoresAtipicos')).not.toBe(claveDeAnalisisDeSesion('s2', 'ValoresAtipicos'));
    expect(claveDeAnalisisDeSesion('s1', 'ValoresAtipicos')).not.toBe(claveDeAnalisisDeSesion('s1', 'CalidadDeDatos'));

    expect(claveDeAnalisisDelDia(new Date('2026-10-08T23:59:59Z'), 'Graficos')).toBe('dia:2026-10-08:Graficos');
    expect(claveDeAnalisisDelDia(new Date('2026-10-09T00:00:00Z'), 'Graficos')).toBe('dia:2026-10-09:Graficos');
  });
});
