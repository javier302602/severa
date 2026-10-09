import { Fragment, StrictMode } from 'react';
import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalisisDatosPage } from '../../../src/pages/analisis-datos/AnalisisDatosPage';
import { analisisDatosService, type DatasetAbierto, type DiagnosticoColumna } from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EnvoltorioQuery, EnvoltorioQueryConRutas } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: {
    analizar: vi.fn(),
    listarDatasets: vi.fn(),
    abrirDataset: vi.fn(),
    obtenerEstadisticasDescriptivas: vi.fn(),
    obtenerPropuestaDeLimpieza: vi.fn(),
    previsualizarLimpieza: vi.fn(),
    aplicarLimpieza: vi.fn(),
    listarVersiones: vi.fn(),
    obtenerBitacora: vi.fn(),
    corregirTipoDeVariable: vi.fn()
  }
}));

const columna = (nombre: string, faltantes: number): DiagnosticoColumna => ({
  nombre,
  tipo: 'numerica',
  tipoDetallado: 'numerica_discreta',
  tipoDetectado: 'numerica_discreta',
  tipoCorregidoManualmente: false,
  valoresFaltantes: faltantes,
  porcentajeFaltante: faltantes * 10,
  valoresUnicos: 5,
  valoresInconsistentes: 0
});

const abierto = (cambios: Partial<DatasetAbierto>): DatasetAbierto => ({
  sesionId: 'sesion-1',
  datasetId: 'dataset-1',
  datasetOriginalId: 'dataset-1',
  nombreArchivo: 'encuesta.csv',
  version: 0,
  versionBase: null,
  diagnostico: { totalFilas: 10, filasDuplicadas: 0, columnas: [columna('edad', 2)] },
  tiposCorregidos: {},
  variableObjetivo: { estado: 'pendiente', columna: null },
  ...cambios
});

const DATASET_GUARDADO = {
  datasetOriginalId: 'dataset-1',
  nombreArchivo: 'encuesta.csv',
  fechaCarga: '2026-03-01T10:00:00.000Z',
  totalFilas: 10,
  totalColumnas: 1,
  versionesProcesadas: 1,
  ultimaVersion: { datasetId: 'dataset-v1', version: 1, fecha: '2026-03-02T10:00:00.000Z' }
};

async function subirArchivo() {
  const archivo = new File(['edad\n20\n'], 'encuesta.csv', { type: 'text/csv' });
  await userEvent.upload(screen.getByLabelText('Archivo a analizar'), archivo);
  await userEvent.click(screen.getByRole('button', { name: 'Analizar archivo' }));
  return archivo;
}

describe('AnalisisDatosPage', () => {
  beforeEach(() => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([]);
    vi.mocked(analisisDatosService.obtenerEstadisticasDescriptivas).mockResolvedValue({ columnas: [] });
    vi.mocked(analisisDatosService.listarVersiones).mockResolvedValue([]);
    vi.mocked(analisisDatosService.obtenerBitacora).mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  test('un archivo recién analizado queda abierto como "Original", con todas las pestañas', async () => {
    vi.mocked(analisisDatosService.analizar).mockResolvedValue({
      sesionId: 'sesion-1',
      datasetId: 'dataset-1',
      totalFilas: 10,
      filasDuplicadas: 0,
      columnas: [columna('edad', 2)]
    });
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });

    const archivo = await subirArchivo();

    expect(await screen.findByTestId('version-abierta')).toHaveTextContent('Original');
    expect(analisisDatosService.analizar).toHaveBeenCalledWith(archivo);
    expect(screen.getByText('encuesta.csv')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((pestana) => pestana.textContent)).toEqual([
      'Estadísticas descriptivas',
      'Análisis univariado',
      'Matriz de correlación',
      'Valores atípicos',
      'Serie de tiempo',
      'Variable objetivo',
      'Valores faltantes',
      'Versiones y bitácora'
    ]);
    // RF-111: el tipo de cada variable se puede corregir desde la tabla.
    expect(screen.getByLabelText('Tipo de edad')).toBeEnabled();
  });

  test('acepta los cinco formatos que lee el backend (RF-105)', () => {
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });

    expect(screen.getByLabelText('Archivo a analizar')).toHaveAttribute('accept', '.csv,.tsv,.json,.xlsx,.xls');
  });

  test('si el backend no informa el dataset guardado, no ofrece lo que necesita guardarse', async () => {
    vi.mocked(analisisDatosService.analizar).mockResolvedValue({ sesionId: 'sesion-1', totalFilas: 10, filasDuplicadas: 0, columnas: [columna('edad', 2)] });
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });

    await subirArchivo();
    await screen.findByTestId('version-abierta');

    const pestanas = screen.getAllByRole('tab').map((pestana) => pestana.textContent);
    expect(pestanas).toContain('Serie de tiempo');
    expect(pestanas).not.toContain('Variable objetivo');
    expect(pestanas).not.toContain('Valores faltantes');
    expect(pestanas).not.toContain('Versiones y bitácora');
    expect(screen.queryByLabelText('Tipo de edad')).not.toBeInTheDocument();
  });

  test('RF-136: abrir desde "Mis datasets" una versión guardada, sin volver a subir el archivo', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([DATASET_GUARDADO]);
    vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(
      abierto({ sesionId: 'sesion-9', datasetId: 'dataset-v1', version: 1, versionBase: 0, diagnostico: { totalFilas: 8, filasDuplicadas: 0, columnas: [columna('edad', 0)] } })
    );
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir la versión 1 de encuesta.csv' }));

    expect(await screen.findByTestId('version-abierta')).toHaveTextContent('Versión 1');
    expect(analisisDatosService.abrirDataset).toHaveBeenCalledWith('dataset-v1');
    expect(screen.getByText('(generada desde el original)')).toBeInTheDocument();
    expect(screen.getByText('Abriste la versión 1 de «encuesta.csv».')).toBeInTheDocument();
    expect(screen.getByText(/8 fila\(s\)/)).toBeInTheDocument();
    // Los análisis se piden para la sesión nueva.
    await waitFor(() => expect(analisisDatosService.obtenerEstadisticasDescriptivas).toHaveBeenCalledWith('sesion-9'));
  });

  test('si no se puede abrir el dataset, muestra el error y sigue en la pantalla de entrada', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([DATASET_GUARDADO]);
    vi.mocked(analisisDatosService.abrirDataset).mockRejectedValue(new HttpError(404, 'Dataset no encontrado'));
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir el original de encuesta.csv' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Dataset no encontrado');
    expect(screen.queryByTestId('version-abierta')).not.toBeInTheDocument();
  });

  test('RF-120/136/137: después de una limpieza la página pasa a trabajar sobre la versión nueva y lo avisa', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([DATASET_GUARDADO]);
    vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(abierto({}));
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue({
      totalFilas: 10,
      totalColumnas: 1,
      propuestas: [
        {
          columna: 'edad',
          tipo: 'numerica_discreta',
          valoresFaltantes: 2,
          porcentajeFaltante: 20,
          opciones: [
            { estrategia: 'eliminar_registros', disponible: true, metodos: [] },
            { estrategia: 'eliminar_columna', disponible: true, metodos: [] },
            { estrategia: 'imputar', disponible: true, metodos: ['media', 'mediana'] }
          ],
          recomendacion: { estrategia: 'imputar', metodo: 'media', motivo: 'Faltan 2 de 10 (20%).' }
        }
      ]
    });
    const resumen = {
      filasAntes: 10,
      filasDespues: 10,
      filasEliminadas: 0,
      columnasEliminadas: [],
      celdasImputadas: 2,
      operaciones: [{ operacion: 'imputar' as const, variable: 'edad', registrosAfectados: 2, metodo: 'media', valorImputado: 30 }]
    };
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    vi.mocked(analisisDatosService.aplicarLimpieza).mockResolvedValue({
      ...abierto({ sesionId: 'sesion-2', datasetId: 'dataset-v2', version: 2, versionBase: 0, diagnostico: { totalFilas: 10, filasDuplicadas: 0, columnas: [columna('edad', 0)] } }),
      versionBase: 0,
      resumen
    });
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir el original de encuesta.csv' }));
    await screen.findByTestId('version-abierta');

    await userEvent.click(screen.getByRole('tab', { name: 'Valores faltantes' }));
    await userEvent.selectOptions(await screen.findByLabelText('Qué hacer con edad'), 'imputar:media');
    await userEvent.click(screen.getByRole('button', { name: 'Ver qué pasaría' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Confirmo estos cambios/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Generar versión procesada' }));

    await waitFor(() => expect(screen.getByTestId('version-abierta')).toHaveTextContent('Versión 2'));
    expect(analisisDatosService.aplicarLimpieza).toHaveBeenCalledWith('sesion-1', [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }]);
    expect(screen.getByText(/Se generó la versión 2 de «encuesta.csv»: 0 fila\(s\) eliminada\(s\), 0 variable\(s\) eliminada\(s\) y 2 valor\(es\) imputado\(s\)/)).toBeInTheDocument();
    // Queda en "Versiones y bitácora", que se pide para la versión nueva.
    expect(screen.getByRole('tab', { name: 'Versiones y bitácora' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(analisisDatosService.listarVersiones).toHaveBeenCalledWith('dataset-v2'));
  });

  test('"Cerrar y elegir otro" vuelve a la pantalla de entrada', async () => {
    vi.mocked(analisisDatosService.listarDatasets).mockResolvedValue([DATASET_GUARDADO]);
    vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(abierto({}));
    render(<AnalisisDatosPage />, { wrapper: EnvoltorioQueryConRutas });
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir el original de encuesta.csv' }));
    await screen.findByTestId('version-abierta');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar y elegir otro' }));

    expect(screen.queryByTestId('version-abierta')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Archivo a analizar')).toBeInTheDocument();
    expect(await screen.findByText('Mis datasets')).toBeInTheDocument();
  });
  // RF-11: "el analista puede reabrir un análisis previo".
  describe('reabrir desde el historial', () => {
    function EstadoDeRuta() {
      const location = useLocation();
      return <p data-testid="estado-de-ruta">{JSON.stringify(location.state)}</p>;
    }

    function montarConEstado(state: unknown, { modoEstricto = false } = {}) {
      const Envoltorio = modoEstricto ? StrictMode : Fragment;
      return render(
        <Envoltorio>
          <MemoryRouter initialEntries={[{ pathname: '/analisis-datos', state }]}>
            <EnvoltorioQuery>
              <Routes>
                <Route
                  path="/analisis-datos"
                  element={
                    <>
                      <AnalisisDatosPage />
                      <EstadoDeRuta />
                    </>
                  }
                />
              </Routes>
            </EnvoltorioQuery>
          </MemoryRouter>
        </Envoltorio>
      );
    }

    // La aplicación corre con <StrictMode> (main.tsx): en desarrollo cada
    // componente se monta, se desmonta y se vuelve a montar. Una reapertura
    // disparada en la primera pasada terminaba sin que la pantalla se enterara.
    test('también funciona con el doble montaje de StrictMode, y abre una sola vez', async () => {
      vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(abierto({ sesionId: 'sesion-v1', datasetId: 'dataset-v1', version: 1, versionBase: 0 }));

      montarConEstado({ reabrir: { datasetId: 'dataset-v1', pestana: 'correlacion' } }, { modoEstricto: true });

      expect(await screen.findByTestId('version-abierta')).toHaveTextContent('Versión 1');
      expect(analisisDatosService.abrirDataset).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Abriendo el dataset…')).not.toBeInTheDocument();
    });

    test('abre el dataset pedido, en la pestaña del análisis, sin que el analista tenga que buscarlo', async () => {
      vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(abierto({ sesionId: 'sesion-v1', datasetId: 'dataset-v1', version: 1, versionBase: 0 }));

      montarConEstado({ reabrir: { datasetId: 'dataset-v1', pestana: 'versiones' } });

      expect(await screen.findByTestId('version-abierta')).toHaveTextContent('Versión 1');
      expect(analisisDatosService.abrirDataset).toHaveBeenCalledTimes(1);
      expect(analisisDatosService.abrirDataset).toHaveBeenCalledWith('dataset-v1');
      expect(screen.getByRole('tab', { name: 'Versiones y bitácora' })).toHaveAttribute('aria-selected', 'true');
    });

    test('la solicitud se consume: no queda en la ruta para reabrir de nuevo al recargar o volver atrás', async () => {
      vi.mocked(analisisDatosService.abrirDataset).mockResolvedValue(abierto({}));

      montarConEstado({ reabrir: { datasetId: 'dataset-1', pestana: 'descriptivas' } });

      await screen.findByTestId('version-abierta');
      expect(screen.getByTestId('estado-de-ruta')).toHaveTextContent('null');
      expect(analisisDatosService.abrirDataset).toHaveBeenCalledTimes(1);
    });

    test('si el dataset ya no existe, lo dice y deja la pantalla lista para elegir otro', async () => {
      vi.mocked(analisisDatosService.abrirDataset).mockRejectedValue(new HttpError(404, 'Dataset no encontrado'));

      montarConEstado({ reabrir: { datasetId: 'dataset-borrado', pestana: 'correlacion' } });

      expect(await screen.findByText('Dataset no encontrado')).toBeInTheDocument();
      expect(screen.getByLabelText('Archivo a analizar')).toBeInTheDocument();
    });

    test.each([null, {}, { reabrir: null }, { reabrir: { datasetId: 7 } }, { reabrir: { datasetId: '' } }])(
      'un estado de navegación que no es una solicitud válida (%j) se ignora',
      async (state) => {
        montarConEstado(state);

        expect(await screen.findByLabelText('Archivo a analizar')).toBeInTheDocument();
        expect(analisisDatosService.abrirDataset).not.toHaveBeenCalled();
      }
    );
  });
});
