import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SerieDeTiempoSeccion } from '../../../src/pages/analisis-datos/SerieDeTiempoSeccion';
import { VariableObjetivoSeccion } from '../../../src/pages/analisis-datos/VariableObjetivoSeccion';
import { analisisDatosService, type EstadoDeVariableObjetivo, type EvaluacionDeSerieDeTiempo } from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { evaluarSerieDeTiempo: vi.fn(), obtenerVariableObjetivo: vi.fn(), definirVariableObjetivo: vi.fn() }
}));

afterEach(() => vi.clearAllMocks());

// El indicador de carga también es un role="status": por eso las pruebas
// esperan a que el estado tenga el texto final en vez de tomar el primero.

// RF-108.
describe('SerieDeTiempoSeccion', () => {
  const viable: EvaluacionDeSerieDeTiempo = {
    esViableComoSerieDeTiempo: true,
    columnaSugerida: 'fecha',
    variablesNumericas: ['ventas', 'visitas'],
    resumen: 'Se puede tratar como serie de tiempo diaria usando «fecha» como eje temporal.',
    columnasTemporales: [
      {
        columna: 'fecha',
        tipo: 'fecha',
        valoresValidos: 18,
        instantesDistintos: 18,
        desde: '2024-03-01T00:00:00.000Z',
        hasta: '2024-03-20T00:00:00.000Z',
        viabilidad: 'directa',
        frecuencia: 'diaria',
        periodosConDatos: 18,
        periodosFaltantes: 2,
        cobertura: 0.9,
        motivo: 'Frecuencia diaria: 18 períodos con exactamente un registro cada uno.'
      }
    ]
  };

  test('dataset viable: muestra el resumen, la columna temporal con sus números y las variables a observar', async () => {
    vi.mocked(analisisDatosService.evaluarSerieDeTiempo).mockResolvedValue(viable);

    render(<SerieDeTiempoSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se puede tratar como serie de tiempo diaria'));
    expect(analisisDatosService.evaluarSerieDeTiempo).toHaveBeenCalledWith('sesion-1');
    // Las fechas se muestran como están en los datos, sin correrse de día por la zona horaria.
    expect(screen.getByText('01/03/2024 — 20/03/2024')).toBeInTheDocument();
    expect(screen.getByText('Diaria')).toBeInTheDocument();
    expect(screen.getByText('18 con datos, 2 sin datos (90.0%)')).toBeInTheDocument();
    expect(screen.getByText('Sí, directamente')).toBeInTheDocument();
    expect(screen.getByText(/Frecuencia diaria: 18 períodos/)).toBeInTheDocument();
    expect(screen.getByText('ventas, visitas')).toBeInTheDocument();
  });

  test('sin columnas de fecha: informa que no es viable y no dibuja la tabla', async () => {
    vi.mocked(analisisDatosService.evaluarSerieDeTiempo).mockResolvedValue({
      esViableComoSerieDeTiempo: false,
      columnaSugerida: null,
      variablesNumericas: ['precio'],
      columnasTemporales: [],
      resumen: 'El dataset no tiene ninguna columna de fecha o fecha-hora: no se puede tratar como serie de tiempo.'
    });

    render(<SerieDeTiempoSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no se puede tratar como serie de tiempo'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/Variables numéricas que se podrían observar/)).not.toBeInTheDocument();
  });

  test('una columna con hora muestra la hora; una sin frecuencia regular lo dice', async () => {
    vi.mocked(analisisDatosService.evaluarSerieDeTiempo).mockResolvedValue({
      ...viable,
      esViableComoSerieDeTiempo: false,
      columnasTemporales: [
        { ...viable.columnasTemporales[0], tipo: 'fecha_hora', desde: '2024-03-01T08:30:00.000Z', hasta: '2024-03-01T17:45:00.000Z', viabilidad: 'no_viable', frecuencia: null }
      ]
    });

    render(<SerieDeTiempoSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('01/03/2024 08:30 — 01/03/2024 17:45')).toBeInTheDocument();
    expect(screen.getByText('Sin frecuencia regular')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });
});

// RF-110: "el sistema no fija la variable objetivo sin confirmación del analista".
describe('VariableObjetivoSeccion', () => {
  const pendiente: EstadoDeVariableObjetivo = {
    candidatas: [
      { columna: 'aprobado', tipo: 'binaria', puntaje: 7, motivos: ['Es una variable binaria (dos valores posibles).', 'Su nombre sugiere un resultado («aprobado»).'] },
      { columna: 'satisfaccion', tipo: 'categorica_ordinal', puntaje: 5, motivos: ['Tiene pocas categorías (3).'] }
    ],
    nota: 'Son sugerencias a partir de la forma y el nombre de las columnas.',
    decision: { estado: 'pendiente', columna: null },
    columnasElegibles: ['edad', 'satisfaccion', 'aprobado']
  };

  function renderizar() {
    const onDecisionCambiada = vi.fn();
    render(<VariableObjetivoSeccion sesionId="sesion-1" onReiniciar={vi.fn()} onDecisionCambiada={onDecisionCambiada} />, { wrapper: EnvoltorioQuery });
    return { onDecisionCambiada };
  }

  test('muestra las candidatas con su justificación y deja claro que la decisión está pendiente', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);

    renderizar();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Todavía no definiste una variable objetivo'));
    expect(screen.getByText('Es una variable binaria (dos valores posibles).')).toBeInTheDocument();
    expect(screen.getByText('Tiene pocas categorías (3).')).toBeInTheDocument();
    expect(screen.getByText('(Binaria)')).toBeInTheDocument();
    expect(screen.getByText(/Son sugerencias a partir de la forma/)).toBeInTheDocument();
  });

  test('ver las sugerencias no fija nada: solo consulta', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);

    renderizar();
    await screen.findByText('Sugerencias del sistema');

    expect(analisisDatosService.definirVariableObjetivo).not.toHaveBeenCalled();
  });

  test('confirmar una sugerencia', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);
    const decision = { estado: 'confirmada' as const, columna: 'aprobado' };
    vi.mocked(analisisDatosService.definirVariableObjetivo).mockResolvedValue({ decision, anterior: pendiente.decision, huboCambio: true });
    const { onDecisionCambiada } = renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar aprobado' }));

    await waitFor(() => expect(analisisDatosService.definirVariableObjetivo).toHaveBeenCalledWith('sesion-1', 'aprobado'));
    await waitFor(() => expect(onDecisionCambiada).toHaveBeenCalledWith(decision));
  });

  test('elegir una columna que el sistema no sugirió', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);
    vi.mocked(analisisDatosService.definirVariableObjetivo).mockResolvedValue({
      decision: { estado: 'confirmada', columna: 'edad' },
      anterior: pendiente.decision,
      huboCambio: true
    });
    renderizar();

    const usar = await screen.findByRole('button', { name: 'Usar como variable objetivo' });
    // Sin elegir columna, el botón no hace nada.
    expect(usar).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Otra columna'), 'edad');
    await userEvent.click(usar);

    await waitFor(() => expect(analisisDatosService.definirVariableObjetivo).toHaveBeenCalledWith('sesion-1', 'edad'));
  });

  test('rechazar: indicar que el análisis no tiene variable objetivo manda null', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);
    vi.mocked(analisisDatosService.definirVariableObjetivo).mockResolvedValue({
      decision: { estado: 'rechazada', columna: null },
      anterior: pendiente.decision,
      huboCambio: true
    });
    renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Este análisis no tiene variable objetivo' }));

    await waitFor(() => expect(analisisDatosService.definirVariableObjetivo).toHaveBeenCalledWith('sesion-1', null));
  });

  test('con una variable ya confirmada: la muestra, y esa candidata no ofrece confirmarse otra vez', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue({ ...pendiente, decision: { estado: 'confirmada', columna: 'aprobado' } });

    renderizar();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Variable objetivo: aprobado (confirmada por vos).'));
    expect(screen.queryByRole('button', { name: 'Confirmar aprobado' })).not.toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    // La otra candidata sí: el analista puede cambiar de opinión.
    expect(screen.getByRole('button', { name: 'Confirmar satisfaccion' })).toBeEnabled();
  });

  test('ya rechazada: lo dice, y el botón de rechazar queda deshabilitado', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue({ ...pendiente, decision: { estado: 'rechazada', columna: null } });

    renderizar();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Indicaste que este análisis no tiene variable objetivo.'));
    expect(screen.getByRole('button', { name: 'Este análisis no tiene variable objetivo' })).toBeDisabled();
  });

  test('sin candidatas: lo dice, y se puede elegir a mano igual', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue({ ...pendiente, candidatas: [] });

    renderizar();

    expect(await screen.findByText('El sistema no encontró candidatas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Otra columna')).toBeEnabled();
  });

  test('si el backend rechaza la columna, muestra el motivo', async () => {
    vi.mocked(analisisDatosService.obtenerVariableObjetivo).mockResolvedValue(pendiente);
    vi.mocked(analisisDatosService.definirVariableObjetivo).mockRejectedValue(
      new HttpError(400, 'La columna "codigo" no puede ser variable objetivo: es un identificador, un texto libre o una fecha.')
    );
    renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar aprobado' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no puede ser variable objetivo');
  });
});
