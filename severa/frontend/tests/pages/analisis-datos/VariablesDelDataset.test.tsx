import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariablesDelDataset } from '../../../src/pages/analisis-datos/VariablesDelDataset';
import { analisisDatosService, type DiagnosticoDeCalidad, type ResultadoCorreccionDeTipo } from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { corregirTipoDeVariable: vi.fn() }
}));

// RF-111: "el analista puede corregir manualmente el tipo detectado para
// cualquier variable".
const diagnostico: DiagnosticoDeCalidad = {
  totalFilas: 10,
  filasDuplicadas: 0,
  columnas: [
    {
      nombre: 'codigo_postal',
      tipo: 'numerica',
      tipoDetallado: 'numerica_discreta',
      tipoDetectado: 'numerica_discreta',
      tipoCorregidoManualmente: false,
      valoresFaltantes: 0,
      porcentajeFaltante: 0,
      valoresUnicos: 4,
      valoresInconsistentes: 0
    },
    {
      nombre: 'ingreso',
      tipo: 'numerica',
      tipoDetallado: 'numerica_continua',
      tipoDetectado: 'texto_libre',
      tipoCorregidoManualmente: true,
      valoresFaltantes: 3,
      porcentajeFaltante: 30,
      valoresUnicos: 7,
      valoresInconsistentes: 0
    }
  ]
};

function resultadoCon(columnas: DiagnosticoDeCalidad['columnas']): ResultadoCorreccionDeTipo {
  return {
    huboCambio: true,
    columna: 'codigo_postal',
    tipoAnterior: 'numerica_discreta',
    tipoVigente: 'categorica_nominal',
    tipoDetectado: 'numerica_discreta',
    tiposCorregidos: { codigo_postal: 'categorica_nominal' },
    diagnostico: { ...diagnostico, columnas }
  };
}

function renderizar(props: Partial<Parameters<typeof VariablesDelDataset>[0]> = {}) {
  const onDiagnosticoActualizado = vi.fn();
  render(
    <VariablesDelDataset sesionId="sesion-1" diagnostico={diagnostico} puedeCorregir onDiagnosticoActualizado={onDiagnosticoActualizado} {...props} />,
    { wrapper: EnvoltorioQuery }
  );
  return { onDiagnosticoActualizado };
}

describe('VariablesDelDataset — RF-111', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra el tipo vigente de cada variable en un selector, y marca cuál es el detectado', () => {
    renderizar();

    const selector = screen.getByLabelText('Tipo de codigo_postal') as HTMLSelectElement;
    expect(selector.value).toBe('numerica_discreta');
    expect(selector.options).toHaveLength(9);
    expect(screen.getAllByRole('option', { name: 'Numérica discreta (detectado)' })).toHaveLength(1);
    // La de "ingreso" fue corregida: su tipo detectado era otro.
    expect((screen.getByLabelText('Tipo de ingreso') as HTMLSelectElement).value).toBe('numerica_continua');
    expect(screen.getAllByRole('option', { name: 'Texto libre (detectado)' })).toHaveLength(1);
  });

  test('cambiar el tipo lo manda al backend y entrega el diagnóstico recalculado', async () => {
    const columnasNuevas = [{ ...diagnostico.columnas[0], tipo: 'categorica' as const, tipoDetallado: 'categorica_nominal' as const, tipoCorregidoManualmente: true }];
    vi.mocked(analisisDatosService.corregirTipoDeVariable).mockResolvedValue(resultadoCon(columnasNuevas));
    const { onDiagnosticoActualizado } = renderizar();

    await userEvent.selectOptions(screen.getByLabelText('Tipo de codigo_postal'), 'categorica_nominal');

    await waitFor(() => expect(analisisDatosService.corregirTipoDeVariable).toHaveBeenCalledWith('sesion-1', 'codigo_postal', 'categorica_nominal'));
    await waitFor(() => expect(onDiagnosticoActualizado).toHaveBeenCalledWith({ ...diagnostico, columnas: columnasNuevas }));
  });

  test('una variable corregida se distingue, y se puede volver al tipo detectado', async () => {
    vi.mocked(analisisDatosService.corregirTipoDeVariable).mockResolvedValue(resultadoCon(diagnostico.columnas));
    renderizar();

    // Solo "ingreso" está corregida.
    expect(screen.getAllByText('corregido')).toHaveLength(1);
    expect(screen.queryByLabelText('Volver al tipo detectado de codigo_postal')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Volver al tipo detectado de ingreso'));

    await waitFor(() => expect(analisisDatosService.corregirTipoDeVariable).toHaveBeenCalledWith('sesion-1', 'ingreso', null));
  });

  test('si el backend rechaza el tipo, muestra su explicación y no cambia el diagnóstico', async () => {
    vi.mocked(analisisDatosService.corregirTipoDeVariable).mockRejectedValue(
      new HttpError(400, 'No se puede tratar "codigo_postal" como fecha: ninguno de sus valores es una fecha reconocible.')
    );
    const { onDiagnosticoActualizado } = renderizar();

    await userEvent.selectOptions(screen.getByLabelText('Tipo de codigo_postal'), 'fecha');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede tratar "codigo_postal" como fecha');
    expect(onDiagnosticoActualizado).not.toHaveBeenCalled();
    // El selector sigue mostrando el tipo vigente, no el que se intentó.
    expect((screen.getByLabelText('Tipo de codigo_postal') as HTMLSelectElement).value).toBe('numerica_discreta');
  });

  test('sin dataset guardado no hay dónde guardar la corrección: el tipo se muestra como texto, sin selector', () => {
    renderizar({ puedeCorregir: false });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Numérica discreta')).toBeInTheDocument();
  });

  test('un diagnóstico que solo trae el tipo general se muestra igual', () => {
    renderizar({
      diagnostico: {
        totalFilas: 1,
        filasDuplicadas: 2,
        columnas: [{ nombre: 'precio', tipo: 'numerica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 1, valoresInconsistentes: 0 }]
      }
    });

    expect(screen.getByText('Numérica')).toBeInTheDocument();
    expect(screen.getByText(/2 fila\(s\) duplicada\(s\)/)).toBeInTheDocument();
  });
});
