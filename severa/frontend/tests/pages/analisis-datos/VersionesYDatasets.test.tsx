import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionesSeccion } from '../../../src/pages/analisis-datos/VersionesSeccion';
import { MisDatasets } from '../../../src/pages/analisis-datos/MisDatasets';
import { AvisoErrorSeccion } from '../../../src/pages/analisis-datos/AvisoErrorSeccion';
import { ContextoDeReapertura } from '../../../src/pages/analisis-datos/contextoDeReapertura';
import { analisisDatosService, type EntradaDeBitacora, type ResumenDeVersion } from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { descargarArchivo } from '../../../src/utils/descargarArchivo';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { listarVersiones: vi.fn(), obtenerBitacora: vi.fn(), exportarDataset: vi.fn(), listarDatasets: vi.fn() }
}));
vi.mock('../../../src/utils/descargarArchivo', () => ({ descargarArchivo: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const versiones: ResumenDeVersion[] = [
  { datasetId: 'dataset-1', version: 0, versionBase: null, esOriginal: true, fecha: '2026-03-01T10:00:00.000Z', totalFilas: 60, totalColumnas: 8, operaciones: [] },
  {
    datasetId: 'dataset-v1',
    version: 1,
    versionBase: 0,
    esOriginal: false,
    fecha: '2026-03-02T10:00:00.000Z',
    totalFilas: 57,
    totalColumnas: 8,
    operaciones: [
      { operacion: 'eliminar_registros', variable: 'ciudad', metodo: 'eliminación de filas con el valor faltante', registrosAfectados: 3 },
      { operacion: 'imputar', variable: 'edad', metodo: 'media', registrosAfectados: 7 }
    ]
  }
];

function entrada(cambios: Partial<EntradaDeBitacora>): EntradaDeBitacora {
  return {
    id: 'b1',
    fecha: '2026-03-02T10:00:00.000Z',
    secuencia: 0,
    operacion: 'imputar',
    variable: 'edad',
    registrosAfectados: 7,
    metodo: 'media',
    versionOrigen: 0,
    versionResultado: 1,
    detalle: { valorImputado: 37.61234 },
    nombreAnalista: 'Ana Pérez',
    ...cambios
  };
}

// RF-136 y RF-123.
describe('VersionesSeccion', () => {
  function renderizar(datasetId = 'dataset-v1') {
    const onAbrir = vi.fn();
    render(<VersionesSeccion datasetId={datasetId} nombreArchivo="encuesta.csv" abriendo={false} onAbrir={onAbrir} />, { wrapper: EnvoltorioQuery });
    return { onAbrir };
  }

  test('lista el original y cada versión con lo que se le hizo, y marca cuál está abierta', async () => {
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue(versiones);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([]);

    renderizar();

    const filaOriginal = (await screen.findByText('El archivo tal como se cargó')).closest('tr') as HTMLElement;
    expect(within(filaOriginal).getByText('60 × 8')).toBeInTheDocument();
    const filaV1 = screen.getByText(/Eliminación de registros de ciudad/).closest('tr') as HTMLElement;
    expect(within(filaV1).getByText('57 × 8')).toBeInTheDocument();
    expect(within(filaV1).getByText('(abierta)')).toBeInTheDocument();
    expect(within(filaV1).getByText(/Imputación de edad \(media\)/)).toBeInTheDocument();
    expect(analisisDatosService.listarVersiones).toHaveBeenCalledWith('dataset-v1');
  });

  test('recuperar una versión anterior: abrir el original desde la versión 1', async () => {
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue(versiones);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([]);
    const { onAbrir } = renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir original' }));

    expect(onAbrir).toHaveBeenCalledWith('dataset-1');
    // La que ya está abierta no se puede "abrir" de nuevo.
    expect(screen.getByRole('button', { name: 'Abrir versión 1' })).toBeDisabled();
  });

  test('exportar una versión descarga un .xlsx con el nombre del archivo y la versión', async () => {
    const blob = new Blob(['xlsx']);
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue(versiones);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([]);
    vi.mocked(analisisDatosService.exportarDataset).mockResolvedValue(blob);
    renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Exportar versión 1 a Excel' }));
    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledWith(blob, 'encuesta-version-1.xlsx'));
    expect(analisisDatosService.exportarDataset).toHaveBeenCalledWith('dataset-v1');

    await userEvent.click(screen.getByRole('button', { name: 'Exportar original a Excel' }));
    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledWith(blob, 'encuesta-original.xlsx'));
  });

  test('RF-123: la bitácora muestra usuario, operación, variable, registros, método y a qué versión corresponde', async () => {
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue(versiones);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([
      entrada({ id: 'b0', operacion: 'corregir_tipo', variable: 'ingreso', registrosAfectados: 60, metodo: 'manual', versionResultado: null, detalle: {} }),
      entrada({ id: 'b1' }),
      entrada({ id: 'b2', operacion: 'definir_variable_objetivo', variable: null, registrosAfectados: 0, metodo: 'descartada por el analista', versionOrigen: 1, versionResultado: null, detalle: {} })
    ]);

    renderizar();

    const filaImputacion = (await screen.findByText('media (valor: 37.6123)')).closest('tr') as HTMLElement;
    expect(within(filaImputacion).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(filaImputacion).getByText('Imputación')).toBeInTheDocument();
    expect(within(filaImputacion).getByText('edad')).toBeInTheDocument();
    expect(within(filaImputacion).getByText('7')).toBeInTheDocument();
    expect(within(filaImputacion).getByText('de original a versión 1')).toBeInTheDocument();

    // Las operaciones que no generan versión dicen sobre cuál se hicieron.
    expect(within(screen.getByText('Corrección de tipo').closest('tr') as HTMLElement).getByText('sobre original')).toBeInTheDocument();
    expect(within(screen.getByText('descartada por el analista').closest('tr') as HTMLElement).getByText('sobre versión 1')).toBeInTheDocument();
    expect(analisisDatosService.obtenerBitacora).toHaveBeenCalledWith('dataset-v1');
  });

  test('RF-139: el cambio de criterio de clasificación aparece en la bitácora con el criterio y la columna clave', async () => {
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue(versiones);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([
      entrada({
        id: 'b3',
        operacion: 'configurar_criterio',
        variable: 'puntaje',
        registrosAfectados: 57,
        metodo: 'umbrales numéricos',
        versionOrigen: 1,
        versionResultado: null,
        detalle: {
          anterior: { criterio: null, columnaClave: null },
          nuevo: {
            criterio: { nombreColumna: 'puntaje', tipo: 'numerica', umbrales: [{ minimo: 7, etiqueta: 'Alto' }, { minimo: 0, etiqueta: 'Bajo' }] },
            columnaClave: 'codigo'
          }
        }
      }),
      entrada({
        id: 'b4',
        operacion: 'configurar_criterio',
        variable: 'nivel',
        registrosAfectados: 57,
        metodo: 'orden de categorías',
        versionOrigen: 1,
        versionResultado: null,
        detalle: { nuevo: { criterio: { nombreColumna: 'nivel', tipo: 'ordinal', ordenCategorias: ['Bajo', 'Medio', 'Alto'] }, columnaClave: null } }
      })
    ]);

    renderizar();

    const fila = (await screen.findByText('umbrales numéricos: Alto desde 7, Bajo desde 0; columna clave: codigo')).closest('tr') as HTMLElement;
    expect(within(fila).getByText('Criterio de clasificación')).toBeInTheDocument();
    expect(within(fila).getByText('puntaje')).toBeInTheDocument();
    expect(screen.getByText('orden de categorías: Bajo < Medio < Alto')).toBeInTheDocument();
  });

  test('un dataset sin operaciones lo dice en vez de mostrar una tabla vacía', async () => {
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue([versiones[0]]);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([]);

    renderizar('dataset-1');

    expect(await screen.findByText('Todavía no se hizo ninguna operación sobre este dataset.')).toBeInTheDocument();
  });
});

describe('MisDatasets — RF-136', () => {
  test('lista los datasets guardados y permite abrir el original o la última versión', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([
      {
        datasetOriginalId: 'dataset-1',
        nombreArchivo: 'encuesta.csv',
        fechaCarga: '2026-03-01T10:00:00.000Z',
        totalFilas: 60,
        totalColumnas: 8,
        versionesProcesadas: 2,
        ultimaVersion: { datasetId: 'dataset-v2', version: 2, fecha: '2026-03-03T10:00:00.000Z' }
      },
      {
        datasetOriginalId: 'dataset-9',
        nombreArchivo: 'ventas.xlsx',
        fechaCarga: '2026-02-01T10:00:00.000Z',
        totalFilas: 3,
        totalColumnas: 1,
        versionesProcesadas: 0,
        ultimaVersion: { datasetId: 'dataset-9', version: 0, fecha: '2026-02-01T10:00:00.000Z' }
      }
    ]);
    const onAbrir = vi.fn();

    render(<MisDatasets abriendo={false} onAbrir={onAbrir} />, { wrapper: EnvoltorioQuery });

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir la versión 2 de encuesta.csv' }));
    expect(onAbrir).toHaveBeenLastCalledWith('dataset-v2');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el original de encuesta.csv' }));
    expect(onAbrir).toHaveBeenLastCalledWith('dataset-1');
    // Un dataset sin versiones procesadas solo ofrece el original.
    expect(screen.getByRole('button', { name: 'Abrir el original de ventas.xlsx' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir la versión \d+ de ventas.xlsx/ })).not.toBeInTheDocument();
  });

  test('sin datasets guardados no muestra nada (ni un título vacío)', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([]);

    const { container } = render(<MisDatasets abriendo={false} onAbrir={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(analisisDatosService.listarDatasets).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('AvisoErrorSeccion — sesión expirada', () => {
  const sesionExpirada = new HttpError(404, 'Sesión de análisis no encontrada');

  test('si la página sabe qué dataset es, ofrece reabrirlo en vez de volver a subir el archivo', async () => {
    const reabrir = vi.fn();
    const onReiniciar = vi.fn();

    render(
      <ContextoDeReapertura.Provider value={{ reabrir, reabriendo: false }}>
        <AvisoErrorSeccion error={sesionExpirada} onReiniciar={onReiniciar} />
      </ContextoDeReapertura.Provider>
    );

    expect(screen.getByText(/El dataset sigue guardado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir el dataset' }));
    expect(reabrir).toHaveBeenCalledTimes(1);
    expect(onReiniciar).not.toHaveBeenCalled();
  });

  test('sin dataset conocido, mantiene el aviso de siempre', async () => {
    const onReiniciar = vi.fn();

    render(<AvisoErrorSeccion error={sesionExpirada} onReiniciar={onReiniciar} />);

    expect(screen.getByText(/Volvé a subir el archivo para continuar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir el dataset' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Subir otro archivo' }));
    expect(onReiniciar).toHaveBeenCalledTimes(1);
  });

  test('un error que no es de sesión se muestra como error, con su mensaje', () => {
    render(
      <ContextoDeReapertura.Provider value={{ reabrir: vi.fn(), reabriendo: false }}>
        <AvisoErrorSeccion error={new HttpError(400, 'La columna "x" no existe en este dataset')} onReiniciar={vi.fn()} />
      </ContextoDeReapertura.Provider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('La columna "x" no existe en este dataset');
    expect(screen.queryByRole('button', { name: 'Reabrir el dataset' })).not.toBeInTheDocument();
  });
});
