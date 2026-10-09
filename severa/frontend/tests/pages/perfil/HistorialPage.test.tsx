import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HistorialPage } from '../../../src/pages/perfil/HistorialPage';
import { perfilService, type AnalisisDelHistorial, type PaginaDeHistorial } from '../../../src/api/perfilService';
import { HttpError } from '../../../src/api/httpClient';
import { descargarArchivo } from '../../../src/utils/descargarArchivo';
import { pestanaDeAnalisis, leerSolicitudDeReapertura } from '../../../src/pages/analisis-datos/reaperturaDesdeHistorial';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/perfilService', () => ({
  ANALISIS_POR_PAGINA: 25,
  perfilService: { obtener: vi.fn(), editar: vi.fn(), listarHistorial: vi.fn(), exportarHistorial: vi.fn() }
}));

vi.mock('../../../src/utils/descargarArchivo', () => ({ descargarArchivo: vi.fn() }));

vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: () => ({ analista: { id: 'analista-1', nombre: 'Ana', correo: 'ana@example.com', rol: 'analista' } })
}));

const evento = (cambios: Partial<AnalisisDelHistorial>): AnalisisDelHistorial => ({
  id: 'e1',
  fechaHora: '2026-10-08T15:00:00.000Z',
  tipoEvento: 'MatrizDeCorrelacion',
  tipoDeAnalisis: 'Matriz de correlación',
  origen: 'dataset',
  dataset: 'encuesta.csv',
  datasetId: 'dataset-1',
  version: 0,
  detalle: null,
  ...cambios
});

function pagina(eventos: AnalisisDelHistorial[], extras: Partial<PaginaDeHistorial> = {}): PaginaDeHistorial {
  return { eventos, total: eventos.length, limite: 25, desplazamiento: 0, ...extras };
}

// Pantallas de destino mínimas, para comprobar a dónde lleva "Reabrir".
function Destino({ nombre }: { nombre: string }) {
  const location = useLocation();
  return (
    <p>
      {nombre} {JSON.stringify(location.state)}
    </p>
  );
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/historial']}>
      <EnvoltorioQuery>
        <Routes>
          <Route path="/historial" element={<HistorialPage />} />
          <Route path="/analisis-datos" element={<Destino nombre="pantalla de análisis de datos" />} />
          <Route path="/priorizacion" element={<Destino nombre="pantalla de priorización" />} />
          <Route path="/informes" element={<Destino nombre="pantalla de informes" />} />
        </Routes>
      </EnvoltorioQuery>
    </MemoryRouter>
  );
}

describe('HistorialPage — RF-11', () => {
  // Con llaves: vitest toma lo que devuelve un beforeEach como función de
  // limpieza y la ejecuta al terminar el test, y mockResolvedValue devuelve
  // el propio mock.
  beforeEach(() => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(pagina([]));
  });
  afterEach(() => vi.clearAllMocks());

  test('lista cada análisis con su fecha, su dataset (y versión), su tipo y su detalle', async () => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(
      pagina([
        evento({ id: 'e1', tipoDeAnalisis: 'Informe completo', tipoEvento: 'InformeDeDataset', version: 2, detalle: 'Formato PDF' }),
        evento({ id: 'e2', origen: 'catalogo', dataset: 'Catálogo de vulnerabilidades', datasetId: null, version: null, tipoEvento: 'RankingDeUrgencia', tipoDeAnalisis: 'Ranking de urgencia' })
      ])
    );

    montar();

    const filas = await screen.findAllByRole('row');
    expect(filas).toHaveLength(3);
    const primera = within(filas[1]);
    expect(primera.getByText(new Date('2026-10-08T15:00:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(primera.getByText('encuesta.csv')).toBeInTheDocument();
    expect(primera.getByText('(versión 2)')).toBeInTheDocument();
    expect(primera.getByText('Informe completo')).toBeInTheDocument();
    expect(primera.getByText('Formato PDF')).toBeInTheDocument();
    const segunda = within(filas[2]);
    expect(segunda.getByText('Catálogo de vulnerabilidades')).toBeInTheDocument();
    expect(segunda.getByText('Ranking de urgencia')).toBeInTheDocument();
    expect(segunda.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('2 análisis en total')).toBeInTheDocument();
  });

  test('sin análisis, lo dice y ofrece por dónde empezar; no deja exportar un historial vacío', async () => {
    montar();

    expect(await screen.findByText(/Todavía no hiciste ningún análisis/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Análisis de Datos' })).toHaveAttribute('href', '/analisis-datos');
    expect(screen.getByRole('button', { name: 'Exportar a Excel' })).toBeDisabled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('si no se puede cargar, muestra el error del servidor', async () => {
    vi.mocked(perfilService.listarHistorial).mockRejectedValue(new HttpError(500, 'Error interno'));

    montar();

    expect(await screen.findByText('Error interno')).toBeInTheDocument();
  });

  test('reabrir un análisis de un dataset lleva a Análisis de Datos con ese dataset y la pestaña del análisis', async () => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(pagina([evento({ datasetId: 'dataset-v2', version: 2 })]));
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir Matriz de correlación de encuesta.csv' }));

    expect(await screen.findByText(/pantalla de análisis de datos/)).toHaveTextContent(
      JSON.stringify({ reabrir: { datasetId: 'dataset-v2', pestana: 'correlacion' } })
    );
  });

  test('reabrir un análisis del catálogo lleva a la pantalla que lo calcula', async () => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(
      pagina([evento({ origen: 'catalogo', dataset: 'Catálogo de vulnerabilidades', datasetId: null, version: null, tipoEvento: 'RankingDeUrgencia', tipoDeAnalisis: 'Ranking de urgencia' })])
    );
    montar();

    await userEvent.click(await screen.findByRole('link', { name: 'Reabrir Ranking de urgencia' }));

    expect(await screen.findByText(/pantalla de priorización/)).toBeInTheDocument();
  });

  test('un análisis cuyo dataset no quedó guardado no ofrece reabrir', async () => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(pagina([evento({ dataset: 'Dataset sin guardar', datasetId: null, version: null })]));
    montar();

    expect(await screen.findByText('No disponible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reabrir/ })).not.toBeInTheDocument();
  });

  test('pagina: pide la página siguiente y vuelve', async () => {
    const pagina0 = Array.from({ length: 25 }, (_, i) => evento({ id: `p0-${i}` }));
    const pagina1 = [evento({ id: 'p1-0', dataset: 'ventas.xlsx' })];
    vi.mocked(perfilService.listarHistorial).mockImplementation(async (numero = 0) =>
      numero === 0 ? pagina(pagina0, { total: 26 }) : pagina(pagina1, { total: 26, desplazamiento: 25 })
    );
    montar();

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Más recientes' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguos →' }));

    expect(await screen.findByText('ventas.xlsx')).toBeInTheDocument();
    expect(perfilService.listarHistorial).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más antiguos →' })).toBeDisabled();
  });
});

describe('HistorialPage — RF-14 (exportar a Excel)', () => {
  afterEach(() => vi.clearAllMocks());

  test('exporta el historial y lo descarga como .xlsx', async () => {
    const blob = new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(pagina([evento({})]));
    vi.mocked(perfilService.exportarHistorial).mockResolvedValue(blob);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Exportar a Excel' }));

    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledWith(blob, 'historial-de-analisis.xlsx'));
    expect(perfilService.exportarHistorial).toHaveBeenCalledTimes(1);
  });

  test('si la exportación falla, muestra el error y no descarga nada', async () => {
    vi.mocked(perfilService.listarHistorial).mockResolvedValue(pagina([evento({})]));
    vi.mocked(perfilService.exportarHistorial).mockRejectedValue(new HttpError(500, 'No se pudo generar el archivo'));
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Exportar a Excel' }));

    expect(await screen.findByText('No se pudo generar el archivo')).toBeInTheDocument();
    expect(descargarArchivo).not.toHaveBeenCalled();
  });
});

describe('reaperturaDesdeHistorial', () => {
  test('cada tipo de análisis con pestaña propia abre la suya; el resto, la primera', () => {
    expect(pestanaDeAnalisis('EstadisticasDescriptivas')).toBe('descriptivas');
    expect(pestanaDeAnalisis('AnalisisUnivariado')).toBe('univariado');
    expect(pestanaDeAnalisis('MatrizDeCorrelacion')).toBe('correlacion');
    expect(pestanaDeAnalisis('ValoresAtipicos')).toBe('outliers');
    expect(pestanaDeAnalisis('SerieDeTiempo')).toBe('serie');
    expect(pestanaDeAnalisis('VariableObjetivo')).toBe('objetivo');
    expect(pestanaDeAnalisis('LimpiezaDeDatos')).toBe('versiones');
    expect(pestanaDeAnalisis('DatasetCargado')).toBe('descriptivas');
    expect(pestanaDeAnalisis('InformeDeDataset')).toBe('descriptivas');
    expect(pestanaDeAnalisis('AlgoQueNoExiste')).toBe('descriptivas');
  });

  test('una pestaña desconocida en la solicitud cae a la primera, sin descartar el dataset', () => {
    expect(leerSolicitudDeReapertura({ reabrir: { datasetId: 'd1', pestana: 'inventada' } })).toEqual({ datasetId: 'd1', pestana: 'descriptivas' });
    expect(leerSolicitudDeReapertura({ reabrir: { datasetId: 'd1' } })).toEqual({ datasetId: 'd1', pestana: 'descriptivas' });
    expect(leerSolicitudDeReapertura('texto')).toBeNull();
  });
});
